import type { CodingAgentResult } from "./codingAgent.js";

/**
 * Predicate gating the orchestrator-level partial-branch safety net
 * (`pushPartialBranch()` in `runIssueCore.ts`). Returns true when the
 * coding-agent run ended in a non-clean state where in-flight worktree
 * edits could be lost without intervention.
 *
 * Issue #95 — broaden from the original `error_max_turns`-only check
 * (PR #92) to every non-clean exit shape the SDK can surface today,
 * plus a future-proofing slot for #86's cost-ceiling abort.
 *
 * Match conditions:
 *   1. `errorSubtype === "error_max_turns"` — original case (turn-budget
 *      truncation; the recovery pass in codingAgent.ts may itself fail).
 *   2. `errorSubtype === "error_during_execution"` — uncaught throw from
 *      a tool-call mid-run; same value-loss shape.
 *   3. `errorSubtype === "error_max_budget_usd"` — future-proofing for
 *      #86's hard cost ceiling. The predicate trips automatically once
 *      the SDK starts surfacing the subtype.
 *   4. `isError && !envelope` — catch-all for non-clean exits where the
 *      SDK didn't tag a known subtype but `runCodingAgent` reported the
 *      run failed and produced no parseable terminal envelope.
 *
 * The labeled-branch shape stays `<branch>-incomplete-<runId>`; the
 * subtype is encoded only in the salvage commit message (see
 * `pushPartialBranch()`), preserving PR #92's `VP_DEV_BRANCH_RE`
 * non-match invariant.
 *
 * Note: callers MUST still gate on the orthogonal conditions
 * (worktree present, not dry-run, envelope decision !== "implement");
 * those concerns live at the call site, not in this predicate.
 */
export function shouldPushPartial(
  result: Pick<CodingAgentResult, "errorSubtype" | "isError" | "envelope">,
): boolean {
  if (result.errorSubtype === "error_max_turns") return true;
  if (result.errorSubtype === "error_during_execution") return true;
  if (result.errorSubtype === "error_max_budget_usd") return true;
  if (result.isError && !result.envelope) return true;
  return false;
}
