export type Decision = "implement" | "pushback" | "error" | "error_max_turns";

/**
 * One (development-agent × issue) measurement. Produced by aggregate.ts from a
 * spawn log; consumed by score.ts and the regression fit.
 */
export interface Cell {
  agentId: string;
  agentSizeBytes: number;
  issueId: number;
  decision: Decision | null;
  reason: string | null;
  costUsd: number;
  durationMs: number;
  isError: boolean;
  errorReason: string | null;
  log: string;
}

/**
 * Outcome-quality composite per development agent (one number per studied size).
 * Components per #179:
 *   quality = 0.40 * implement_rate
 *           + 0.25 * pushback_accuracy_rate
 *           + 0.20 * (1 - error_max_turns_rate)
 *           + 0.15 * pr_correctness_rate
 */
export interface QualityScore {
  agentId: string;
  agentSizeBytes: number;
  cellCount: number;
  implementRate: number;
  pushbackAccuracyRate: number;
  errorMaxTurnsRate: number;
  prCorrectnessRate: number;
  quality: number;
}

/**
 * One measured calibration sample on the curve. Persisted in
 * `src/util/contextCostCurve.ts` as `CONTEXT_COST_SAMPLES`. The curve at
 * evaluation time is an OLS polynomial regression over these samples.
 */
export interface CurveSample {
  xBytes: number;
  factor: number;
}

/**
 * Operator-supplied pushback-accuracy / PR-correctness rubric scores per
 * (agentId, issueId). Optional: cells without a rubric entry contribute
 * neutral defaults (pushback_accuracy=1 if outcome=pushback, else 0;
 * pr_correctness=1 if outcome=implement, else 0).
 */
export interface RubricScore {
  agentId: string;
  issueId: number;
  pushbackAccuracy?: 0 | 1;
  prCorrectness?: 0 | 1;
}
