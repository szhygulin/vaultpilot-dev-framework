// Pre-dispatch deduplication detection (issue #150, Phase 2a-i of #133).
//
// `detectDuplicates` makes a single Opus model call to cluster a batch of
// GitHub issues by semantic overlap. For each cluster of 2+ duplicates the
// model proposes a canonical (most-detailed body, most-comments, oldest
// creation) plus a one-sentence rationale.
//
// Phase 2a-i scope: this module is exported and unit-tested but NOT wired
// into the orchestrator or CLI. Phase 2a-ii (separate issue) threads the
// dedup pass between triage and `pickAgents`, persists the result into
// `RunState.duplicateClustersDetected`, and renders a "Duplicate clusters"
// block in the approval-gate preview. Phase 2b layers the destructive
// `--apply-dedup` close path on top.
//
// Design notes:
// - Single `query()` call with `maxTurns: 1` — same shape as `triage.ts`.
// - Fail-soft: any model error / malformed JSON returns `{ clusters: [],
//   costUsd }` rather than throwing. The dedup pass is a pre-flight
//   convenience; a flaky model call must never block a run.
// - The Zod-validated parse is split into a pure helper
//   (`parseDedupResponse`) so tests can exercise the parsing rubric
//   without spinning up the SDK or paying for a real Opus call.
// - Issue #156: a content-hash cache (mirroring `triage.ts`'s per-issue
//   cache) stabilizes both the cluster output AND the per-call cost
//   across `--plan` → `--confirm` invocations. Without it, the LLM call
//   re-runs on every invocation: cost varies (LLM is non-deterministic
//   in token-billing even when the cluster decision is stable), the
//   `Dedup cost:` line in the gate text drifts, and the previewHash
//   check rejects the very first `--confirm` after a fresh `--plan`.
//   The cache also avoids paying for the Opus call twice when a single
//   user is just walking the two-step flow (plan, then confirm).

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { ensureDir } from "../state/locks.js";
import { ORCHESTRATOR_MODEL_DEDUP } from "./models.js";
import type { IssueDetail } from "../github/gh.js";
import type { DuplicateCluster } from "../types.js";
import type { Logger } from "../log/logger.js";

export const DEDUP_DIR = path.resolve(process.cwd(), "state", "dedup");

// Resolved at module load from `models.ts` (env-overridable). See
// `src/orchestrator/models.ts` for tier rationale and override env vars.
const DEDUP_MODEL = ORCHESTRATOR_MODEL_DEDUP;

const RATIONALE_MAX = 400;

const DuplicateClusterSchema = z.object({
  canonical: z.number().int().positive(),
  duplicates: z.array(z.number().int().positive()).min(1),
  rationale: z.string().min(1).max(RATIONALE_MAX),
});

const DedupResponseSchema = z.object({
  clusters: z.array(DuplicateClusterSchema),
});

export interface DetectDuplicatesInput {
  issues: IssueDetail[];
  logger?: Logger;
  /**
   * Issue #156: target repo slug ("owner/repo") used to namespace the
   * dedup cache file under `state/dedup/<owner__repo>.json`. When
   * omitted (e.g. unit tests that don't care about persistence), the
   * cache is bypassed entirely — every call hits the model. Production
   * call-sites (`src/cli.ts`) MUST pass this so the `--plan` → `--confirm`
   * flow returns identical clusters and identical cost on the second
   * invocation, keeping the previewHash stable.
   */
  targetRepo?: string;
}

export interface DetectDuplicatesResult {
  clusters: DuplicateCluster[];
  costUsd: number;
  /**
   * Issue #156: true when the result was served from the cache (no
   * model call). Surfaced so the orchestrator can log cache-hit rate
   * the same way `triage.ts` does, and so the `--plan` / `--confirm`
   * round-trip can be observed in the run log.
   */
  fromCache: boolean;
}

/**
 * Cluster a batch of issues by semantic duplication.
 *
 * Returns `{ clusters: [], costUsd: 0 }` when called with fewer than two
 * issues (no duplicates possible) — the model is not invoked. Otherwise
 * issues a single Opus call (`maxTurns: 1`) and parses the response into
 * `DuplicateCluster[]`.
 *
 * Fail-soft: model errors, exceptions, and malformed JSON are logged
 * (when a logger is provided) and surface as `{ clusters: [], costUsd }`.
 * Callers MUST treat an empty result as "no duplicates detected" — never
 * as "dedup pass succeeded with high confidence".
 */
export async function detectDuplicates(
  input: DetectDuplicatesInput,
): Promise<DetectDuplicatesResult> {
  if (input.issues.length < 2) {
    return { clusters: [], costUsd: 0, fromCache: false };
  }

  // Issue #156: cache layer mirrors `triage.ts`. Hash is over the input
  // issue set's content (body + comments + labels) plus the rubric
  // fingerprint, so the cache invalidates when:
  //   - any issue's body or comments change (body/comment edits surface
  //     in the next `gh issue view`)
  //   - the candidate set itself changes (an issue closes / a new one
  //     enters the dispatch list, e.g. when triage flips a verdict)
  //   - the rubric or prompt-builder shape changes (RUBRIC_FINGERPRINT
  //     bump on `DEDUP_SYSTEM_PROMPT` edits)
  // When `targetRepo` is omitted (tests / dry-run-with-no-persistence)
  // the cache is bypassed and every call hits the model.
  const contentHash = computeContentHash(input.issues);
  if (input.targetRepo) {
    const cached = await readCache(input.targetRepo, contentHash);
    if (cached) {
      input.logger?.info("dedup.cache_hit", {
        contentHash,
        clusterCount: cached.clusters.length,
        costUsd: cached.costUsd,
        issueCount: input.issues.length,
      });
      return {
        clusters: cached.clusters,
        costUsd: cached.costUsd,
        fromCache: true,
      };
    }
  }

  const userPrompt = buildPrompt(input.issues);
  let raw = "";
  let costUsd = 0;
  try {
    const stream = query({
      prompt: userPrompt,
      options: {
        model: DEDUP_MODEL,
        systemPrompt: DEDUP_SYSTEM_PROMPT,
        tools: [],
        permissionMode: "default",
        env: process.env,
        maxTurns: 1,
        settingSources: [],
        persistSession: false,
      },
    });
    for await (const msg of stream) {
      if (msg.type === "result") {
        if (msg.subtype === "success") {
          raw = msg.result;
          costUsd = msg.total_cost_usd ?? 0;
        } else {
          input.logger?.warn("dedup.model_failed", { subtype: msg.subtype });
          return { clusters: [], costUsd: 0, fromCache: false };
        }
      }
    }
  } catch (err) {
    input.logger?.warn("dedup.exception", { err: (err as Error).message });
    return { clusters: [], costUsd: 0, fromCache: false };
  }

  const validIds = new Set(input.issues.map((i) => i.id));
  const parsed = parseDedupResponse(raw, validIds);
  if (!parsed) {
    input.logger?.warn("dedup.malformed_payload", {
      raw: raw.slice(0, 4000),
    });
    // Don't cache parse failures: the next invocation should retry the
    // model rather than serve `clusters: []` with whatever cost was
    // billed for the malformed call.
    return { clusters: [], costUsd, fromCache: false };
  }
  if (input.targetRepo) {
    // Best-effort: a cache write failure is not a run blocker. The
    // caller already has the result; the worst case is the next
    // `--confirm` re-runs the model and trips previewHash drift, which
    // surfaces as the documented error rather than silent corruption.
    try {
      await writeCache(input.targetRepo, contentHash, parsed, costUsd);
    } catch (err) {
      input.logger?.warn("dedup.cache_write_failed", {
        err: (err as Error).message,
      });
    }
  }
  return { clusters: parsed, costUsd, fromCache: false };
}

/**
 * Parse a raw model response into validated `DuplicateCluster[]`.
 *
 * Returns `null` on any parse failure (not an empty array — the caller
 * needs to distinguish "model said no duplicates" from "couldn't parse").
 * When `validIssueIds` is supplied, clusters whose `canonical` or
 * `duplicates` reference issues outside the input batch are dropped:
 * the model occasionally hallucinates a number, and a fabricated
 * canonical would silently misroute Phase 2a-ii's preview.
 *
 * Exported so unit tests can exercise the parsing rubric without
 * invoking the SDK.
 */
export function parseDedupResponse(
  raw: string,
  validIssueIds?: Set<number>,
): DuplicateCluster[] | null {
  const json = parseJsonLoose(raw);
  if (!json) return null;
  const result = DedupResponseSchema.safeParse(json);
  if (!result.success) return null;
  const clusters: DuplicateCluster[] = [];
  for (const c of result.data.clusters) {
    // canonical must not also appear in the duplicates list
    if (c.duplicates.includes(c.canonical)) continue;
    // de-dupe the duplicates array defensively
    const uniqueDups = Array.from(new Set(c.duplicates));
    if (uniqueDups.length === 0) continue;
    if (validIssueIds) {
      if (!validIssueIds.has(c.canonical)) continue;
      const allKnown = uniqueDups.every((d) => validIssueIds.has(d));
      if (!allKnown) continue;
    }
    clusters.push({
      canonical: c.canonical,
      duplicates: uniqueDups,
      rationale: c.rationale,
    });
  }
  return clusters;
}

const DEDUP_SYSTEM_PROMPT = `You are a deduplication agent. Given a batch of GitHub issues (body + comments), identify clusters of issues that are semantic duplicates of each other.

Rubric:
- Two or more issues form a duplicate CLUSTER when they describe the same problem, propose the same feature, or request the same change — even if worded differently or filed by different reporters.
- Issues that share a topic but propose distinct solutions, scopes, or phases are NOT duplicates. Be CONSERVATIVE; prefer to omit a cluster than to merge non-duplicates.
- Phase splits (Phase 1 / Phase 2 of the same parent) are NOT duplicates of each other.
- For each cluster, pick a CANONICAL using this priority:
    (1) most-detailed body (longest substantive body, not boilerplate),
    (2) most comments (active discussion),
    (3) oldest creation (earliest filed).
  The canonical is the issue to KEEP; the others are duplicates of it.
- The "rationale" must be ONE short sentence that (a) names the canonical issue number and (b) explains in one phrase why the cluster is a duplicate set ("both request X", "both report Y", etc.).

Output: a single JSON object, no fences, no prose around it.
{
  "clusters": [
    {
      "canonical": <issue number>,
      "duplicates": [<issue number>, <issue number>, ...],
      "rationale": "<one short sentence, ≤400 chars, names canonical>"
    }
  ]
}

Hard rules:
- If no clusters are found, return {"clusters": []}.
- Each issue number appears in AT MOST one cluster, either as canonical or in duplicates — never both.
- "duplicates" must contain at least one issue number; never an empty array.
- "canonical" must be an issue number from the input batch; never invent a number.
- No markdown, no code fences, no explanatory prose outside the JSON object.`;

function buildPrompt(issues: IssueDetail[]): string {
  const issueBlocks = issues.map((issue) => {
    const commentBlocks = issue.comments
      .map((c, i) => {
        const ordinal = `${i + 1}/${issue.comments.length}`;
        return `  comment ${ordinal} by ${c.author} at ${c.createdAt}: ${truncate(c.body, 800)}`;
      })
      .join("\n");
    return `### Issue #${issue.id} — ${issue.title}
Labels: ${JSON.stringify(issue.labels)}
Body:
${truncate(issue.body || "(empty)", 2000)}
Comments (${issue.comments.length}):
${commentBlocks || "(none)"}`;
  });
  return `Cluster the following ${issues.length} GitHub issues by semantic duplication per the rubric.

${issueBlocks.join("\n\n---\n\n")}

JSON only.`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

// Issue #156: hash of the rubric + prompt-builder shape, mixed into the
// per-batch contentHash. Bumping the system prompt or buildPrompt() output
// shape auto-invalidates previously-cached cluster decisions; without this
// a rubric edit landing today would still serve yesterday's stale clusters
// for every cached batch until the candidate set itself changed.
const RUBRIC_FINGERPRINT = createHash("sha256")
  .update(DEDUP_SYSTEM_PROMPT)
  .update("\n--prompt-shape-v1--\n") // bump when buildPrompt() output shape changes
  .digest("hex")
  .slice(0, 16);

// Compute a content hash for a batch of issues. Issues are sorted by id so
// the same input set in different order yields the same hash — the dedup
// model is order-insensitive and the cache should be too. Comments are
// keyed by createdAt|author|body (same convention as triage's
// `commentKey`).
function computeContentHash(issues: IssueDetail[]): string {
  const sorted = [...issues].sort((a, b) => a.id - b.id);
  const h = createHash("sha256");
  h.update("rubric:" + RUBRIC_FINGERPRINT + "\n");
  h.update(`count:${sorted.length}\n`);
  for (const issue of sorted) {
    h.update(`#${issue.id}|${issue.title}\n`);
    h.update(`labels:${JSON.stringify(issue.labels)}\n`);
    h.update("body:\n");
    h.update(issue.body ?? "");
    h.update("\n--comments--\n");
    for (const c of issue.comments) {
      h.update(`${c.createdAt}|${c.author}|${c.body}\n`);
    }
    h.update("\n--issue-end--\n");
  }
  return "sha256:" + h.digest("hex").slice(0, 32);
}

interface DedupCacheEntry {
  targetRepo: string;
  contentHash: string;
  clusters: DuplicateCluster[];
  // Cost stored on the original cache-miss invocation. Optional for
  // forward-compat with cache files written by pre-#156 versions; absent
  // entries degrade to `costUsd: 0` (mirrors triage.ts's pre-#137
  // forward-compat behavior).
  costUsd?: number;
  detectedAt: string;
}

interface CachedDedup {
  clusters: DuplicateCluster[];
  costUsd: number;
}

function cacheFilePath(targetRepo: string): string {
  // owner/repo -> owner__repo so the path is a single safe segment.
  return path.join(DEDUP_DIR, `${targetRepo.replace("/", "__")}.json`);
}

async function readCache(
  targetRepo: string,
  contentHash: string,
): Promise<CachedDedup | null> {
  try {
    const raw = await fs.readFile(cacheFilePath(targetRepo), "utf-8");
    const entry = JSON.parse(raw) as DedupCacheEntry;
    if (entry.contentHash !== contentHash) return null;
    // Re-validate the cached clusters defensively: a corrupted file
    // would otherwise smuggle invalid shapes back into the orchestrator.
    if (!Array.isArray(entry.clusters)) return null;
    const validated: DuplicateCluster[] = [];
    for (const c of entry.clusters) {
      const r = DuplicateClusterSchema.safeParse(c);
      if (!r.success) return null;
      validated.push({
        canonical: r.data.canonical,
        duplicates: r.data.duplicates,
        rationale: r.data.rationale,
      });
    }
    const costUsd =
      typeof entry.costUsd === "number" && Number.isFinite(entry.costUsd)
        ? entry.costUsd
        : 0;
    return { clusters: validated, costUsd };
  } catch {
    return null;
  }
}

async function writeCache(
  targetRepo: string,
  contentHash: string,
  clusters: DuplicateCluster[],
  costUsd: number,
): Promise<void> {
  const entry: DedupCacheEntry = {
    targetRepo,
    contentHash,
    clusters,
    costUsd,
    detectedAt: new Date().toISOString(),
  };
  const filePath = cacheFilePath(targetRepo);
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(entry, null, 2));
  await fs.rename(tmp, filePath);
}

// Exported for tests: the cache I/O round-trip is the failure surface for
// issue #156 (Plan diverged on dedup-cost line). A pure-fs test can
// validate the round-trip without an Opus call in the loop.
export const __testInternals = {
  readCache: (targetRepo: string, contentHash: string) =>
    readCache(targetRepo, contentHash),
  writeCache: (
    targetRepo: string,
    contentHash: string,
    clusters: DuplicateCluster[],
    costUsd: number,
  ) => writeCache(targetRepo, contentHash, clusters, costUsd),
  cacheFilePath: (targetRepo: string) => cacheFilePath(targetRepo),
  computeContentHash: (issues: IssueDetail[]) => computeContentHash(issues),
};

// Same shape as `triage.ts:parseJsonLoose` — accepts a JSON object in the
// raw text whether or not the model wrapped it in a ```json fence or
// emitted prose around it. Kept private to this module; the only loose-
// JSON call site here is `parseDedupResponse`.
function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = /```(?:json)?\s*\n([\s\S]*?)\n```/i.exec(trimmed);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
