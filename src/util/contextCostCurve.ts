import {
  evaluatePolynomial,
  fitPolynomialRegression,
  type PolynomialRegression,
} from "../research/curveStudy/regression.js";
import type { CurveSample } from "../research/curveStudy/types.js";

/**
 * Two measured calibration curves over CLAUDE.md size:
 *
 *   ACCURACY_DEGRADATION_SAMPLES — outcome-quality factor; how much worse
 *     the agent gets at picking the right action as context grows.
 *   TOKEN_COST_SAMPLES — token-budget factor; how much more $/turns the
 *     agent burns per cell as context grows.
 *
 * Both are normalized so the cheapest/best size has factor 1.0; values rise
 * as size hurts. Updated via `vp-dev research curve-study --apply`. The
 * runtime composite curve is a weighted combination — see
 * {@link contextCostFactor}.
 *
 * Provenance: seeded from #179's pilot on 2026-05-06 (claude-opus-4-7[1m],
 * advisory-scope-boundary specialty). Re-fit when the orchestrator's
 * primary model tier changes or when calibrating a different specialty.
 *
 * Status: the seed values below are the pre-study placeholders from #177's
 * body. The 2026-05-06 phase-2 run produced a null quality signal (every
 * cell implement) and a not-statistically-significant cost signal (F-test
 * p=0.107). Until a follow-up study with harder issues + operator rubrics
 * lands, these are guesses.
 */
export const ACCURACY_DEGRADATION_SAMPLES: ReadonlyArray<CurveSample> = [
  { xBytes: 8192, factor: 1.0 },
  { xBytes: 16384, factor: 1.2 },
  { xBytes: 32768, factor: 2.5 },
  { xBytes: 49152, factor: 4.0 },
  { xBytes: 65536, factor: 6.0 },
];

export const TOKEN_COST_SAMPLES: ReadonlyArray<CurveSample> = [
  { xBytes: 8192, factor: 1.0 },
  { xBytes: 16384, factor: 1.05 },
  { xBytes: 32768, factor: 1.15 },
  { xBytes: 49152, factor: 1.3 },
  { xBytes: 65536, factor: 1.5 },
];

/**
 * Polynomial degree for the regression fit on each curve. Degree 2 (quadratic)
 * is the default — fits the expected concave-up shape (factor accelerates
 * with size) without overfitting at typical sample counts (≤ 10).
 */
export const CONTEXT_COST_REGRESSION_DEGREE = 2;

/**
 * Default weights for {@link contextCostFactor}. Composite is
 *   accuracy.weight · accuracyDegradationFactor + cost.weight · tokenCostFactor
 *
 * Weights MUST sum to 1.0; the constructor checks. Operator can override
 * per-call by passing `opts.weights`.
 */
export const DEFAULT_COST_WEIGHTS: Readonly<{ accuracy: number; cost: number }> = {
  accuracy: 0.75,
  cost: 0.25,
};

let cachedAccuracy: PolynomialRegression | null = null;
let cachedTokenCost: PolynomialRegression | null = null;

function getAccuracy(): PolynomialRegression {
  if (!cachedAccuracy) {
    cachedAccuracy = fitPolynomialRegression(
      [...ACCURACY_DEGRADATION_SAMPLES],
      CONTEXT_COST_REGRESSION_DEGREE,
    );
  }
  return cachedAccuracy;
}

function getTokenCost(): PolynomialRegression {
  if (!cachedTokenCost) {
    cachedTokenCost = fitPolynomialRegression(
      [...TOKEN_COST_SAMPLES],
      CONTEXT_COST_REGRESSION_DEGREE,
    );
  }
  return cachedTokenCost;
}

/** Test-only: drop the caches so a remap of samples picks up. */
export function resetContextCostCurveCache(): void {
  cachedAccuracy = null;
  cachedTokenCost = null;
}

/**
 * Predicted accuracy-degradation factor at `totalBytes`. ≥ 1 by construction
 * (clamped). Below the smallest sample the regression's prediction may dip
 * below 1; we clamp. Above the largest, the regression extrapolates; pass
 * `clampHigh` to cap at the predicted value at the largest sample's xBytes.
 */
export function accuracyDegradationFactor(
  totalBytes: number,
  opts?: { clampHigh?: boolean },
): number {
  return evaluateClamped(getAccuracy(), ACCURACY_DEGRADATION_SAMPLES, totalBytes, opts);
}

/**
 * Predicted token-cost factor at `totalBytes`. Same conventions as
 * {@link accuracyDegradationFactor}: ≥ 1, clampHigh option for upper extrap.
 */
export function tokenCostFactor(
  totalBytes: number,
  opts?: { clampHigh?: boolean },
): number {
  return evaluateClamped(getTokenCost(), TOKEN_COST_SAMPLES, totalBytes, opts);
}

/**
 * Composite cost-multiplier function. Phase 3 uses this against a section's
 * bytes:
 *   contextCost(section) = bytes(section) × contextCostFactor(currentTotalBytes)
 *
 * Combines both curves under the chosen weights:
 *   factor = w_acc · accuracyDegradationFactor(x) + w_cost · tokenCostFactor(x)
 *
 * Default weights are accuracy 0.75 / cost 0.25 — accuracy-degraded
 * decisions are the worse failure mode (a wrong action persists; a single
 * extra-expensive turn doesn't), but cost is non-zero and worth weighting
 * explicitly. Override via `opts.weights`; weights must sum to 1.0.
 */
export function contextCostFactor(
  totalBytes: number,
  opts?: {
    weights?: { accuracy: number; cost: number };
    clampHigh?: boolean;
  },
): number {
  const w = opts?.weights ?? DEFAULT_COST_WEIGHTS;
  const sum = w.accuracy + w.cost;
  if (Math.abs(sum - 1) > 1e-6) {
    throw new Error(
      `contextCostFactor: weights must sum to 1.0, got ${sum} (accuracy=${w.accuracy}, cost=${w.cost})`,
    );
  }
  if (w.accuracy < 0 || w.cost < 0) {
    throw new Error("contextCostFactor: weights must be non-negative");
  }
  const acc = accuracyDegradationFactor(totalBytes, opts);
  const tc = tokenCostFactor(totalBytes, opts);
  return w.accuracy * acc + w.cost * tc;
}

function evaluateClamped(
  reg: PolynomialRegression,
  samples: ReadonlyArray<CurveSample>,
  xBytes: number,
  opts?: { clampHigh?: boolean },
): number {
  let f = evaluatePolynomial(reg, xBytes);
  if (opts?.clampHigh) {
    const maxSample = samples.reduce(
      (m, s) => (s.xBytes > m.xBytes ? s : m),
      samples[0],
    );
    if (xBytes > maxSample.xBytes) {
      const cap = evaluatePolynomial(reg, maxSample.xBytes);
      if (f > cap) f = cap;
    }
  }
  return Math.max(1, f);
}

/** Read-only accessors for fitted regressions (for tooling / diagnostics). */
export function getAccuracyDegradationRegression(): PolynomialRegression {
  return getAccuracy();
}
export function getTokenCostRegression(): PolynomialRegression {
  return getTokenCost();
}
