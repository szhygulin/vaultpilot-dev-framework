// Project-local CLAUDE.md candidate queue (#179 Phase 2 follow-up to PR #190 + #193).
//
// Operator-side L2 of the lesson cost/benefit pipeline. When `vp-dev lessons
// review` accepts a `<!-- promote-candidate:@local-claude utility=N.M -->`
// block, the body is appended here (under withFileLock) instead of the
// shared-pool. The operator periodically reads this file and opens a chore
// PR appending selected sections to the project-local CLAUDE.md. No
// automatic writes to the tracked file; the queue is the staging surface.
//
// The L2 gate (`evaluateLocalClaudeUtilityGate`) compares the candidate's
// utility (from `utility=N.M` in the marker, or a caller-supplied fallback)
// against the cost score derived from `normalizedAccuracyFactor` at the
// projected post-append local-CLAUDE.md size. Default ratio 2.0 (stricter
// than the per-agent gate's 1.0 default) because bytes added to local
// CLAUDE.md are loaded into every dispatch's prompt by every agent, so
// marginal cost is amplified. Override via `VP_DEV_LOCAL_CLAUDE_UTILITY_RATIO`.

import { promises as fs } from "node:fs";
import path from "node:path";
import { STATE_DIR } from "../state/runState.js";
import { ensureDir, withFileLock } from "../state/locks.js";
import { normalizedAccuracyFactor } from "../util/contextCostCurve.js";

export const LOCAL_CLAUDE_QUEUE_FILE = path.join(
  STATE_DIR,
  "local-claude-md-pending.md",
);

export const DEFAULT_LOCAL_CLAUDE_UTILITY_RATIO = 2.0;

export function resolveLocalClaudeUtilityRatio(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.VP_DEV_LOCAL_CLAUDE_UTILITY_RATIO;
  if (raw == null || raw === "") return DEFAULT_LOCAL_CLAUDE_UTILITY_RATIO;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_LOCAL_CLAUDE_UTILITY_RATIO;
  return n;
}

export interface LocalClaudeUtilityGateInput {
  /** Utility 0..1 emitted by the LLM (or undefined → no signal to act on). */
  utility?: number;
  /** Current byte size of the project-local CLAUDE.md. */
  currentLocalClaudeMdBytes: number;
  /** Length of the candidate body in bytes (heading + body content). */
  candidateBytes: number;
  /** Override env-resolved ratio (testability + per-call adjustment). */
  ratio?: number;
}

export type LocalClaudeUtilityGateResult = {
  /** Final advisory: skip = utility below threshold; let-through otherwise. */
  decision: "let-through" | "skip" | "no-utility";
  /** Cost score in [0, 1] derived from normalizedAccuracyFactor at the projected size. */
  costScore: number;
  /** ratio × costScore — what the utility had to clear. */
  threshold: number;
  /** Resolved ratio (env or override). */
  ratio: number;
};

/**
 * Pure compute. Returns the gate's advisory decision + the numbers the
 * operator-side review UI displays. The caller decides whether to act on
 * "skip" (typically: surface a warning and require an explicit accept) or
 * "let-through" (typically: accept silently).
 */
export function evaluateLocalClaudeUtilityGate(
  input: LocalClaudeUtilityGateInput,
): LocalClaudeUtilityGateResult {
  const ratio = input.ratio ?? resolveLocalClaudeUtilityRatio();
  // Empty queue → gate fully open. Same rationale as the predicted-utility
  // gate in runIssueCore: protects existing context, not the first append.
  // Pre-redo this fell out of the linear-log curve's near-1 extrapolation
  // at small bytes; the post-redo quadratic-raw curve extrapolates upward
  // outside its calibration range, so the empty-file invariant must be
  // explicit.
  if (input.currentLocalClaudeMdBytes <= 0) {
    if (input.utility === undefined) {
      return { decision: "no-utility", costScore: 0, threshold: 0, ratio };
    }
    return { decision: "let-through", costScore: 0, threshold: 0, ratio };
  }
  const projectedBytes = input.currentLocalClaudeMdBytes + input.candidateBytes;
  const factor = normalizedAccuracyFactor(projectedBytes);
  const costScore = Number.isFinite(factor)
    ? Math.max(0, Math.min(1, factor - 1))
    : 0;
  const threshold = costScore * ratio;
  if (input.utility === undefined) {
    return { decision: "no-utility", costScore, threshold, ratio };
  }
  return {
    decision: input.utility >= threshold ? "let-through" : "skip",
    costScore,
    threshold,
    ratio,
  };
}

export interface AppendLocalClaudeQueueInput {
  sourceAgentId: string;
  ts: string;
  /** From `<!-- promote-candidate:@local-claude utility=N.M -->` marker. */
  utility?: number;
  /** L2 gate result captured at accept time (informational, recorded in header). */
  gate?: LocalClaudeUtilityGateResult;
  /** The wrapped block's body content. */
  body: string;
  /** Override target file (testability; defaults to LOCAL_CLAUDE_QUEUE_FILE). */
  filePathOverride?: string;
}

export interface AppendLocalClaudeQueueOutcome {
  filePath: string;
  bytesAppended: number;
  totalBytes: number;
}

/**
 * Append a queue entry under withFileLock. Provenance header records source,
 * timestamp, utility, gate decision + costScore. Body follows verbatim.
 *
 * Concurrent appends serialize via the same lock pattern used by appendBlock
 * for per-agent CLAUDE.md.
 */
export async function appendToLocalClaudeQueue(
  input: AppendLocalClaudeQueueInput,
): Promise<AppendLocalClaudeQueueOutcome> {
  const filePath = input.filePathOverride ?? LOCAL_CLAUDE_QUEUE_FILE;
  await ensureDir(path.dirname(filePath));
  return withFileLock(filePath, async () => {
    let current = "";
    try {
      current = await fs.readFile(filePath, "utf-8");
    } catch {
      current = "";
    }
    const block = formatQueueEntry(input);
    const next =
      current.length === 0 || current.endsWith("\n")
        ? current + block
        : current + "\n" + block;
    const tmp = `${filePath}.tmp.${process.pid}.${process.hrtime.bigint()}`;
    await fs.writeFile(tmp, next);
    await fs.rename(tmp, filePath);
    return {
      filePath,
      bytesAppended: Buffer.byteLength(block, "utf-8"),
      totalBytes: Buffer.byteLength(next, "utf-8"),
    };
  });
}

function formatQueueEntry(input: AppendLocalClaudeQueueInput): string {
  const provenance: string[] = [
    `source=${input.sourceAgentId}`,
    `ts=${input.ts}`,
  ];
  if (input.utility !== undefined && Number.isFinite(input.utility)) {
    provenance.push(`utility=${input.utility}`);
  }
  if (input.gate) {
    provenance.push(
      `gate=${input.gate.decision}`,
      `costScore=${input.gate.costScore.toFixed(4)}`,
      `threshold=${input.gate.threshold.toFixed(4)}`,
      `ratio=${input.gate.ratio}`,
    );
  }
  const header = `<!-- queued ${provenance.join(" ")} -->`;
  // Trailing blank line separates entries cleanly when concatenated.
  return `\n${header}\n${input.body.trim()}\n`;
}
