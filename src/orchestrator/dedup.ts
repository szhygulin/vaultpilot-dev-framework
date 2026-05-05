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

import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { ORCHESTRATOR_MODEL_DEDUP } from "./models.js";
import type { IssueDetail } from "../github/gh.js";
import type { DuplicateCluster } from "../types.js";
import type { Logger } from "../log/logger.js";

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
}

export interface DetectDuplicatesResult {
  clusters: DuplicateCluster[];
  costUsd: number;
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
    return { clusters: [], costUsd: 0 };
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
          return { clusters: [], costUsd: 0 };
        }
      }
    }
  } catch (err) {
    input.logger?.warn("dedup.exception", { err: (err as Error).message });
    return { clusters: [], costUsd: 0 };
  }

  const validIds = new Set(input.issues.map((i) => i.id));
  const parsed = parseDedupResponse(raw, validIds);
  if (!parsed) {
    input.logger?.warn("dedup.malformed_payload", {
      raw: raw.slice(0, 4000),
    });
    return { clusters: [], costUsd };
  }
  return { clusters: parsed, costUsd };
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
