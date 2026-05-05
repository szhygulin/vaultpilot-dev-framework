import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { ensureDir } from "../state/locks.js";
import { getIssueDetail, type IssueComment, type IssueDetail } from "../github/gh.js";
import { detectPendingPostMortem } from "./failurePostMortem.js";
import type { IssueSummary } from "../types.js";
import type { Logger } from "../log/logger.js";

const TRIAGE_MODEL = "claude-haiku-4-5-20251001";
const REASON_MAX = 240;

export const TRIAGE_DIR = path.resolve(process.cwd(), "state", "triage");

export const TriageResultSchema = z.object({
  ready: z.boolean(),
  reason: z.string().min(1).max(REASON_MAX),
  suggestedSpecialty: z.string().max(80).optional(),
});
export type TriageResult = z.infer<typeof TriageResultSchema>;

export interface TriagedIssue {
  issue: IssueSummary;
  result: TriageResult;
  fromCache: boolean;
  costUsd: number;
}

interface CacheEntry {
  targetRepo: string;
  issueNumber: number;
  contentHash: string;
  result: TriageResult;
  // Issue #137: persist the per-issue triage cost from the original (cache-
  // miss) invocation so a subsequent cache-hit invocation can return the same
  // cost. Without this, a cold-cache `--plan` reports `triageCostUsd: 0.0241`
  // and a warm-cache `--confirm` re-invocation reports `triageCostUsd: 0`,
  // making the gate-text `Triage cost:` line drift between the two — which
  // changes the previewHash and triggers a spurious "Plan diverged" error on
  // the very first `--confirm` after every fresh `--plan`. Optional for
  // forward-compat with cache files written by pre-#137 versions; absent
  // entries degrade to `costUsd: 0` (the prior behavior).
  costUsd?: number;
  triagedAt: string;
}

export interface TriageBatchInput {
  targetRepo: string;
  issues: IssueSummary[];
  logger: Logger;
}

export async function triageBatch(input: TriageBatchInput): Promise<TriagedIssue[]> {
  // Sequential: keeps log output ordered and avoids hammering the gh CLI +
  // Anthropic API for ranges of 50+ issues. Triage is a short-lived
  // pre-flight; serial execution costs ~1-2s per issue and keeps the gate
  // text predictable.
  const out: TriagedIssue[] = [];
  for (const issue of input.issues) {
    const triaged = await triageOne({
      targetRepo: input.targetRepo,
      issue,
      logger: input.logger,
    });
    out.push(triaged);
  }
  return out;
}

interface TriageOneInput {
  targetRepo: string;
  issue: IssueSummary;
  logger: Logger;
}

async function triageOne(input: TriageOneInput): Promise<TriagedIssue> {
  const detail = await getIssueDetail(input.targetRepo, input.issue.id);
  if (!detail) {
    // Issue disappeared between range resolve and triage — fail-open.
    return {
      issue: input.issue,
      result: { ready: true, reason: "triage skipped: issue detail unavailable" },
      fromCache: false,
      costUsd: 0,
    };
  }

  // Issue #100: deterministic gate. A `## vp-dev failure post-mortem` comment
  // on the issue means a prior agent attempted-and-failed; without this check
  // the next `vp-dev run` re-dispatches the same issue and burns budget on
  // the same structural blocker. Resolution keywords (`retry`, `fix landed`,
  // `scope changed`, `unblock`, `proceed`) in any later non-post-mortem
  // comment lift the gate. `--include-non-ready` bypasses triage entirely
  // and therefore also overrides this check (see cli.ts:369).
  const pendingPostMortem = detectPendingPostMortem(detail.comments);
  if (pendingPostMortem.pending && pendingPostMortem.reason) {
    input.logger.info("triage.post_mortem_gate", {
      issueId: input.issue.id,
      reason: pendingPostMortem.reason,
    });
    return {
      issue: input.issue,
      result: { ready: false, reason: pendingPostMortem.reason },
      fromCache: false,
      costUsd: 0,
    };
  }

  const contentHash = computeContentHash(detail);
  const cached = await readCache(input.targetRepo, input.issue.id, contentHash);
  if (cached) {
    input.logger.info("triage.cache_hit", {
      issueId: input.issue.id,
      contentHash,
      ready: cached.result.ready,
      costUsd: cached.costUsd,
    });
    // Issue #137: return the cost stored on the original cache-miss
    // invocation. The cache hit itself didn't spend any tokens, but the
    // gate-text `Triage cost:` line is content-determined: it represents
    // the triage cost for *this content*, not "tokens spent in this
    // process invocation". Returning `0` here for a cache hit was the
    // root cause of the "Plan diverged" recurrence — `--plan` (cold
    // cache, real cost) and `--confirm` (warm cache, $0) rendered
    // different `Triage cost:` lines and previewHash drifted.
    return {
      issue: input.issue,
      result: cached.result,
      fromCache: true,
      costUsd: cached.costUsd,
    };
  }

  const fresh = await callTriageModel(detail, input.logger);
  await writeCache(input.targetRepo, input.issue.id, contentHash, fresh.result, fresh.costUsd);
  input.logger.info("triage.evaluated", {
    issueId: input.issue.id,
    contentHash,
    ready: fresh.result.ready,
    reason: fresh.result.reason,
    costUsd: fresh.costUsd,
  });
  return {
    issue: input.issue,
    result: fresh.result,
    fromCache: false,
    costUsd: fresh.costUsd,
  };
}

interface ModelOutcome {
  result: TriageResult;
  costUsd: number;
}

async function callTriageModel(detail: IssueDetail, logger: Logger): Promise<ModelOutcome> {
  const userPrompt = buildPrompt(detail);
  let raw = "";
  let costUsd = 0;
  try {
    const stream = query({
      prompt: userPrompt,
      options: {
        model: TRIAGE_MODEL,
        systemPrompt: TRIAGE_SYSTEM_PROMPT,
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
          // Fail-open: model failure should not block the run.
          logger.warn("triage.model_failed", {
            issueId: detail.id,
            subtype: msg.subtype,
          });
          return failOpen(`triage model failed: ${msg.subtype}`);
        }
      }
    }
  } catch (err) {
    logger.warn("triage.model_failed", {
      issueId: detail.id,
      err: (err as Error).message,
    });
    return failOpen(`triage exception: ${(err as Error).message}`);
  }

  const json = parseJsonLoose(raw);
  if (!json) {
    logger.warn("triage.malformed_payload", {
      issueId: detail.id,
      raw: raw.slice(0, 4000),
    });
    return failOpen("triage output not valid JSON");
  }
  const clamped = clampReason(json);
  const parsed = TriageResultSchema.safeParse(clamped);
  if (!parsed.success) {
    logger.warn("triage.malformed_payload", {
      issueId: detail.id,
      raw: raw.slice(0, 4000),
      zodError: parsed.error.message.replace(/\s+/g, " "),
    });
    return failOpen(`triage schema invalid: ${parsed.error.message.replace(/\s+/g, " ").slice(0, 160)}`);
  }
  return { result: parsed.data, costUsd };
}

function failOpen(reason: string): ModelOutcome {
  return {
    result: { ready: true, reason: `fail-open: ${reason}`.slice(0, REASON_MAX) },
    costUsd: 0,
  };
}

function clampReason(json: unknown): unknown {
  if (!json || typeof json !== "object") return json;
  const obj = json as Record<string, unknown>;
  if (typeof obj.reason === "string" && obj.reason.length > REASON_MAX) {
    return { ...obj, reason: obj.reason.slice(0, REASON_MAX - 3) + "..." };
  }
  return obj;
}

const TRIAGE_SYSTEM_PROMPT = `You are a triage agent. Given a single GitHub issue's body and comments, decide whether it is ready to be picked up by an autonomous coding agent.

Rubric:
- Ready: a concrete bug with a repro, or a feature with explicit acceptance criteria, or a clearly-scoped refactor.
- NOT ready — ambiguous: "we should think about", "explore", "investigate", "discuss", or no acceptance criteria.
- NOT ready — duplicate: the issue body or comments explicitly say it is a duplicate of another open issue.
- NOT ready — body/comments conflict (irreconcilable only): comments mark the issue obsolete / superseded / won't-fix, redirect to a different open issue as a true duplicate, or invalidate the body's premise ("actually we don't want this anymore"). Only skip when the conflict cannot be resolved at dispatch time.

The "Issue Analysis" rule from the agent's CLAUDE.md REQUIRES reading comments — body and comments together form the spec. Prefer comments when they correct or override the body. The MOST RECENT comment (labeled "most recent" in the input) carries the most weight; treat it as the current state of the thread.

Pass through (ready: true) for transient conflicts the dispatched agent can resolve by re-reading comments:
- "blocked on PR #N" / "depends on #M" / "waiting for upstream merge" — the agent re-reads comments at dispatch time and pushes back if still blocked, or proceeds if the dependency landed.
- Comments adding follow-up scope or clarifying acceptance criteria without invalidating the body.
- The most recent comment is a short directive that selects from a previous comment's proposal: "do B", "option a", "go with it", "yes, A", "+1 to that", "ship it", "ack". A short reply RESOLVES the thread. Do NOT weight comment length when assessing resolution — a 4-character directive is as binding as a multi-paragraph rationale, especially when it follows a multi-path proposal.
  Example: comment 3/4 lists options (a/b/c); comment 4/4 is "do B". The thread is resolved → ready: true.

Output: a single JSON object, no fences, no prose.
  {"ready": boolean, "reason": "<one short sentence, ≤240 chars>", "suggestedSpecialty"?: "<short hint, optional>"}

Hard rules:
- Default to ready: true when uncertain (the approval gate is the human backstop).
- If the reason you would write contains "unresolved", "undecided", "left open", "left direction", "no commitment", or "didn't commit" — that IS the uncertainty case. Return ready: true. The dispatched coding agent re-reads comments at runtime and pushes back if it disagrees.
- The "reason" must explain WHY in one short sentence. For ready: cite the concrete signal ("explicit acceptance criteria", "bug with repro", "most recent comment selects option B"). For not-ready: cite the disqualifier ("ambiguous scope", "duplicate of #N", "body/comments conflict").
- No markdown in the reason. No newlines inside the reason — write a single sentence.
- If the body is empty AND there are no comments, return ready: true with reason "empty body — fail open".`;

function buildPrompt(detail: IssueDetail): string {
  const total = detail.comments.length;
  const commentBlocks = detail.comments
    .map((c, i) => {
      const ordinal = `${i + 1}/${total}`;
      let recencyTag = "";
      if (total > 1 && i === total - 1) recencyTag = " (most recent)";
      else if (total > 1 && i === 0) recencyTag = " (oldest)";
      return `--- comment ${ordinal}${recencyTag} by ${c.author} at ${c.createdAt}\n${c.body}`;
    })
    .join("\n\n");
  return `Issue ${detail.id} — ${detail.title}
Labels: ${JSON.stringify(detail.labels)}

Body:
${truncate(detail.body || "(empty)", 6000)}

Comments (${detail.comments.length}):
${truncate(commentBlocks || "(none)", 6000)}

Decide ready/not-ready per the rubric. JSON only.`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

// Hash of the rubric + prompt-builder shape, mixed into the per-issue
// contentHash so that any rubric edit auto-invalidates previously-cached
// triage decisions. Without this, a prompt fix landing today would still
// serve yesterday's stale verdict for every cached issue until its body
// or comments mutate.
const RUBRIC_FINGERPRINT = createHash("sha256")
  .update(TRIAGE_SYSTEM_PROMPT)
  .update("\n--prompt-shape-v2--\n") // bump when buildPrompt() output shape changes
  .digest("hex")
  .slice(0, 16);

function computeContentHash(detail: IssueDetail): string {
  const h = createHash("sha256");
  h.update("rubric:" + RUBRIC_FINGERPRINT + "\n");
  h.update(detail.body ?? "");
  h.update("\n--comments--\n");
  for (const c of detail.comments) {
    h.update(commentKey(c));
    h.update("\n");
  }
  return "sha256:" + h.digest("hex").slice(0, 32);
}

function commentKey(c: IssueComment): string {
  // createdAt + author + body — author/timestamp shifts mean a different
  // comment even if body is identical (rare but real for "+1" threads).
  return `${c.createdAt}|${c.author}|${c.body}`;
}

function repoCacheDir(targetRepo: string): string {
  // owner/repo -> owner__repo so it's a single safe path segment.
  return path.join(TRIAGE_DIR, targetRepo.replace("/", "__"));
}

function cacheFilePath(targetRepo: string, issueNumber: number): string {
  return path.join(repoCacheDir(targetRepo), `${issueNumber}.json`);
}

// Exported for tests: the cache I/O round-trip is the failure surface for
// issue #137 (Plan diverged). A pure-fs test can validate the costUsd
// persistence behavior without the haiku model in the loop.
export const __testInternals = {
  readCache: (targetRepo: string, issueNumber: number, contentHash: string) =>
    readCache(targetRepo, issueNumber, contentHash),
  writeCache: (
    targetRepo: string,
    issueNumber: number,
    contentHash: string,
    result: TriageResult,
    costUsd: number,
  ) => writeCache(targetRepo, issueNumber, contentHash, result, costUsd),
  cacheFilePath: (targetRepo: string, issueNumber: number) =>
    cacheFilePath(targetRepo, issueNumber),
};

interface CachedTriage {
  result: TriageResult;
  // Cost stored on the original cache-miss invocation. `0` for entries
  // written before issue #137 (no `costUsd` field) — fail-soft so older
  // caches keep working but don't reproduce the bug for content already
  // re-triaged after the fix lands.
  costUsd: number;
}

async function readCache(
  targetRepo: string,
  issueNumber: number,
  contentHash: string,
): Promise<CachedTriage | null> {
  try {
    const raw = await fs.readFile(cacheFilePath(targetRepo, issueNumber), "utf-8");
    const entry = JSON.parse(raw) as CacheEntry;
    if (entry.contentHash !== contentHash) return null;
    const parsed = TriageResultSchema.safeParse(entry.result);
    if (!parsed.success) return null;
    const costUsd = typeof entry.costUsd === "number" && Number.isFinite(entry.costUsd)
      ? entry.costUsd
      : 0;
    return { result: parsed.data, costUsd };
  } catch {
    return null;
  }
}

async function writeCache(
  targetRepo: string,
  issueNumber: number,
  contentHash: string,
  result: TriageResult,
  costUsd: number,
): Promise<void> {
  const entry: CacheEntry = {
    targetRepo,
    issueNumber,
    contentHash,
    result,
    costUsd,
    triagedAt: new Date().toISOString(),
  };
  const filePath = cacheFilePath(targetRepo, issueNumber);
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(entry, null, 2));
  await fs.rename(tmp, filePath);
}

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
