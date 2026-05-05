import type { RunState } from "../types.js";
import { formatStatusJson, formatStatusText } from "../state/statusFormatter.js";
import {
  formatRunCompletedSentinel,
  type RunCompletedSentinelInput,
} from "./runCompletedSentinel.js";

/**
 * Issue #136: at the end of every `vp-dev run` (and `runResume`), the CLI
 * needs to print a complete result report to stdout — the sentinel line
 * alone (#128) tells external watchers "run is over" but doesn't answer the
 * operator's actual question ("what happened?"). Without the report, every
 * run-completion this session was followed by a bespoke python script that
 * read state/<runId>.json and re-rendered the per-issue table. This util
 * closes that gap.
 *
 * Format choices:
 *   - Bounded by `=========` separators so external tooling can find the
 *     block deterministically (anchored: `^=========$` followed by a
 *     `Run complete:` line).
 *   - Reuses `formatStatusText` / `formatStatusJson` (PR #123) — the same
 *     shape the operator already sees from `vp-dev status <runId>` after
 *     the fact, no second rendering codepath to keep aligned.
 *   - The sentinel from #128 is appended as the very last line so watchers
 *     anchored on `^run\.completed ` keep working unchanged.
 *
 * The report is emitted to stdout in cmdRun's / runResume's `finally` block
 * — not the main try body — so the report fires uniformly across success,
 * dry-run, aborted-budget, orchestrator-throw paths. This matches the same
 * discipline #128 codified for the sentinel itself.
 */
export interface RunReportInput {
  runId: string;
  state: RunState;
  /** Total spend in USD, summed across triage + orchestrator + coding agent. */
  totalCostUsd: number;
  /** Wall-clock duration from run-start to report-emit. */
  durationMs: number;
  /**
   * Map of agentId -> display name. Forwarded to `formatStatusText` /
   * `formatStatusJson` so per-issue / per-agent rows render with the
   * registry name when available, falling back to bare agentId when not.
   */
  agentNames?: Map<string, string | undefined>;
  /**
   * When true, render the report as JSON (the `formatStatusJson` shape) on
   * stdout instead of the text block. Wired to `--json-report` on the CLI.
   * The terminal sentinel line still follows on its own line so watchers
   * keep working — JSON consumers that anchor on the sentinel can split
   * on it; consumers that read the JSON itself can stop at the trailing
   * newline before `run.completed`.
   */
  json?: boolean;
}

const SEPARATOR = "=========";

/**
 * Build the full stdout block for a completed run: the bounded report
 * (text or JSON) plus the trailing terminal sentinel from #128. Returns
 * the string in one piece so callers can `process.stdout.write` it as a
 * single atomic emission — no risk of an interleaving event-stream line
 * landing between the report and its sentinel.
 *
 * Pure: no I/O. The caller is responsible for resolving the registry-name
 * map and threading it through `agentNames`.
 */
export function formatRunReport(input: RunReportInput): string {
  const sentinelInput: RunCompletedSentinelInput = {
    runId: input.runId,
    state: input.state,
    totalCostUsd: input.totalCostUsd,
    durationMs: input.durationMs,
  };
  const sentinelLine = formatRunCompletedSentinel(sentinelInput);
  if (input.json) {
    // JSON variant — same shape as `vp-dev status <runId> --json`. We add
    // a `---FINAL---` marker line above it so consumers that mix verbose
    // event-stream output with the report can split unambiguously, and
    // emit the sentinel after the JSON's trailing newline so watchers
    // anchored on `^run\.completed ` still find it.
    const json = JSON.stringify(
      formatStatusJson(input.state, { agentNames: input.agentNames }),
      null,
      2,
    );
    return `\n---FINAL---\n${json}\n${sentinelLine}`;
  }
  const header = [
    "",
    SEPARATOR,
    `Run complete: ${input.runId}`,
    SEPARATOR,
    "",
  ].join("\n");
  const body = formatStatusText(input.state, { agentNames: input.agentNames });
  // `formatStatusText` already terminates with a newline, so we only need
  // a single blank-line gap before the sentinel.
  return `${header}\n${body}\n${sentinelLine}`;
}
