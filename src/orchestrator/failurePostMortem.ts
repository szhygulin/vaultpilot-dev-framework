// Failure post-mortem comment helpers — issue #100.
//
// When a coding-agent run terminates non-cleanly (no envelope, decision="error",
// or the SDK truncated with `error_max_turns`), the orchestrator posts a
// structured Markdown comment on the GitHub issue so the next `vp-dev run` can
// detect the prior attempt and skip re-dispatch until a human resolves the
// blocker. Issue #34 burned ~$8.30 across two re-dispatches before a manual
// split — this gate prevents the loop.
//
// The marker line `## vp-dev failure post-mortem` is the canonical sentinel.
// Triage detects it case-insensitively, anchored to `^## ` so quoted text
// in unrelated comments cannot trigger a false positive.
//
// Resolution: a non-bot human comment posted *after* the most recent
// post-mortem containing one of the resolution keywords below flips triage
// back to `ready: true`. The override `--include-non-ready` (which bypasses
// triage entirely) also lifts the gate.

import type { IssueComment } from "../github/gh.js";

/** Anchored sentinel: starts a line, case-insensitive. */
export const POST_MORTEM_SENTINEL = /^## vp-dev failure post-mortem\b/im;

/**
 * Resolution keywords. Lowercase, matched case-insensitively against a
 * later comment's body. Word-boundary anchored so "fix landed" inside an
 * unrelated sentence ("hope a fix landed somewhere") still resolves —
 * intentional: a human writing such a sentence is signaling progress.
 */
export const RESOLUTION_KEYWORDS = [
  "retry",
  "fix landed",
  "scope changed",
  "unblock",
  "proceed",
] as const;

export interface FailurePostMortemInput {
  runId: string;
  agentId: string;
  /** SDK error subtype (e.g. `error_max_turns`). */
  errorSubtype?: string;
  /** Free-form human reason. */
  errorReason?: string;
  /** Per-agent total cost in USD. */
  costUsd?: number;
  /** Wall-clock duration in milliseconds. */
  durationMs?: number;
  /** Labeled `<branch>-incomplete-<runId>` URL when the safety net pushed. */
  partialBranchUrl?: string;
}

/**
 * Compose the Markdown body of a failure post-mortem comment.
 *
 * The first line MUST start with `## vp-dev failure post-mortem` so the
 * triage gate can detect it. The format is intentionally compact — the
 * comment is read by humans during triage, not parsed by tooling (the
 * sentinel + run-state JSON are the structured surfaces).
 */
export function composeFailurePostMortem(input: FailurePostMortemInput): string {
  const cause = input.errorSubtype ?? input.errorReason ?? "unknown";
  const lines: string[] = [];
  lines.push(`## vp-dev failure post-mortem (${input.runId}, ${input.agentId})`);
  lines.push("");
  lines.push(`- **Error subtype**: \`${cause}\``);
  if (input.errorReason && input.errorSubtype && input.errorReason !== input.errorSubtype) {
    lines.push(`- **Error reason**: ${truncate(input.errorReason, 240)}`);
  }
  if (typeof input.costUsd === "number" && Number.isFinite(input.costUsd)) {
    const dur = formatDuration(input.durationMs);
    lines.push(`- **Cost burned**: $${input.costUsd.toFixed(2)}${dur ? ` (${dur})` : ""}`);
  } else if (input.durationMs !== undefined) {
    const dur = formatDuration(input.durationMs);
    if (dur) lines.push(`- **Duration**: ${dur}`);
  }
  if (input.partialBranchUrl) {
    lines.push(`- **Partial branch**: ${input.partialBranchUrl}`);
  }
  lines.push(`- **Likely cause**: ${inferLikelyCause(input.errorSubtype)}`);
  lines.push("");
  lines.push(
    "This issue is now flagged as awaiting human review. Re-dispatch will be skipped by triage until either:",
  );
  lines.push(
    "- A human posts a follow-up comment indicating the structural blocker is resolved (`retry`, `fix landed in #N`, `scope changed`, `unblock`, `proceed`).",
  );
  lines.push("- The operator passes `--include-non-ready` to override.");
  return lines.join("\n");
}

function inferLikelyCause(errorSubtype: string | undefined): string {
  switch (errorSubtype) {
    case "error_max_turns":
      return "feature scope exceeds the 50-turn budget — split along architectural seams (CLAUDE.md \"Pre-dispatch scope-fit check\").";
    case "error_max_budget_usd":
      return "per-run cost ceiling tripped before the agent finished — review the cost-ceiling and the issue's expected complexity.";
    case "error_during_execution":
      return "SDK transport or runtime error during the agent run — re-dispatch may succeed if transient.";
    default:
      return "non-clean exit with no envelope — see run-state JSON for full diagnostic fields.";
  }
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = sec / 60;
  return `${min.toFixed(1)} min`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

export interface PostMortemDetection {
  /** True when a pending post-mortem is the latest agent-attempt signal. */
  pending: boolean;
  /** Triage reason string when `pending` is true. */
  reason?: string;
}

/**
 * Inspect a comment thread for an unresolved failure post-mortem.
 *
 * `pending` is true when:
 *   1. At least one comment matches `POST_MORTEM_SENTINEL`, AND
 *   2. No comment after the most recent post-mortem contains a
 *      resolution keyword (case-insensitive substring match).
 *
 * Comments are processed in chronological order — caller passes them
 * exactly as `getIssueDetail()` returns them (oldest → newest).
 */
export function detectPendingPostMortem(
  comments: ReadonlyArray<IssueComment>,
): PostMortemDetection {
  // Find the index of the most recent post-mortem comment.
  let lastPostMortemIdx = -1;
  let lastPostMortemBody = "";
  for (let i = 0; i < comments.length; i++) {
    if (POST_MORTEM_SENTINEL.test(comments[i].body)) {
      lastPostMortemIdx = i;
      lastPostMortemBody = comments[i].body;
    }
  }
  if (lastPostMortemIdx < 0) return { pending: false };

  // Look at every comment AFTER the last post-mortem for a resolution
  // signal. Resolution requires the comment NOT itself be a post-mortem
  // (vp-dev posting another failure cannot resolve a prior failure).
  for (let i = lastPostMortemIdx + 1; i < comments.length; i++) {
    const c = comments[i];
    if (POST_MORTEM_SENTINEL.test(c.body)) continue;
    if (containsResolutionKeyword(c.body)) {
      return { pending: false };
    }
  }

  // Pending. Extract the run-id from the post-mortem header for the reason
  // string so the triage gate cites which run flagged the issue.
  const runId = extractRunId(lastPostMortemBody);
  const reason = runId
    ? `awaiting human review of prior failure post-mortem (${runId})`
    : "awaiting human review of prior failure post-mortem";
  return { pending: true, reason };
}

function containsResolutionKeyword(body: string): boolean {
  const lower = body.toLowerCase();
  return RESOLUTION_KEYWORDS.some((kw) => lower.includes(kw));
}

function extractRunId(body: string): string | undefined {
  // Header shape: `## vp-dev failure post-mortem (run-2026-..., agent-72c6)`
  const m = /\(\s*(run-[^,)\s]+)/i.exec(body);
  return m ? m[1] : undefined;
}
