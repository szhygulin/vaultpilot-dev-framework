import {
  evaluatePolynomial,
  fitPolynomialRegression,
  type PolynomialRegression,
} from "../research/curveStudy/regression.js";
import type { CurveSample } from "../research/curveStudy/types.js";

/**
 * Measured calibration samples for the accuracy-degradation curve.
 * Updated via `vp-dev research curve-study --apply` (replace mode emits a
 * full new array, update mode merges with existing samples). The runtime
 * curve is an OLS polynomial regression of degree
 * {@link CONTEXT_COST_REGRESSION_DEGREE} over this array.
 *
 * Provenance: seeded from #179's pilot on 2026-05-06 (claude-opus-4-7[1m],
 * advisory-scope-boundary specialty). Re-fit when the orchestrator's primary
 * model tier changes or when calibrating a different specialty class.
 */
export const CONTEXT_COST_SAMPLES: ReadonlyArray<CurveSample> = [
  { xBytes: 8192, factor: 1.0 },
  { xBytes: 16384, factor: 1.2 },
  { xBytes: 32768, factor: 2.5 },
  { xBytes: 49152, factor: 4.0 },
  { xBytes: 65536, factor: 6.0 },
];

/**
 * Polynomial degree for the regression fit. Degree 2 (quadratic) is the
 * default — fits the expected concave-up shape (factor accelerates with
 * size) without overfitting at typical sample counts (≤ 10).
 */
export const CONTEXT_COST_REGRESSION_DEGREE = 2;

let cachedRegression: PolynomialRegression | null = null;
function getRegression(): PolynomialRegression {
  if (!cachedRegression) {
    cachedRegression = fitPolynomialRegression(
      [...CONTEXT_COST_SAMPLES],
      CONTEXT_COST_REGRESSION_DEGREE,
    );
  }
  return cachedRegression;
}

/** Test-only: drop the cache so a remap of samples picks up. */
export function resetContextCostCurveCache(): void {
  cachedRegression = null;
}

/**
 * Phase 3's per-section cost function multiplier:
 *   contextCost(section) = bytes × accuracyDegradationFactor(currentTotalBytes)
 *
 * Returns ≥ 1 by construction (clamped). Below the smallest sample the
 * regression's prediction may dip below 1 — clamped to 1. Above the largest
 * sample the regression extrapolates; pass `clampHigh` to cap at the predicted
 * value at the largest sample's xBytes.
 */
export function contextCostFactor(
  totalBytes: number,
  opts?: { clampHigh?: boolean },
): number {
  const reg = getRegression();
  let f = evaluatePolynomial(reg, totalBytes);
  if (opts?.clampHigh) {
    const maxSample = CONTEXT_COST_SAMPLES.reduce(
      (max, s) => (s.xBytes > max.xBytes ? s : max),
      CONTEXT_COST_SAMPLES[0],
    );
    if (totalBytes > maxSample.xBytes) {
      const cap = evaluatePolynomial(reg, maxSample.xBytes);
      if (f > cap) f = cap;
    }
  }
  return Math.max(1, f);
}

/** Read-only accessor for the fitted regression (for tooling / diagnostics). */
export function getContextCostRegression(): PolynomialRegression {
  return getRegression();
}
