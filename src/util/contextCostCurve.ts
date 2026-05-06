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
 * Provenance: #179 phase 3, K=13 combined fit (legs 1 + 2) on 2026-05-06,
 * claude-opus-4-7[1m], advisory-scope-boundary specialty. 18 trim agents at
 * 6 sizes (~6K, 14K, 22K, 35K, 50K, 58K bytes), 13 issues each (6 vp-mcp +
 * 7 vp-development-agents), 182 scored cells. Both curves clear F-test
 * significance: accuracy p=3.96e-2 (R²=0.239), token-cost p=4.43e-3
 * (R²=0.406). Re-fit when the orchestrator's primary model tier changes or
 * when calibrating a different specialty.
 */
export const ACCURACY_DEGRADATION_SAMPLES: ReadonlyArray<CurveSample> = [
  { xBytes: 5935, factor: 1.0 },
  { xBytes: 5975, factor: 1.045 },
  { xBytes: 5978, factor: 1.017 },
  { xBytes: 13777, factor: 1.06 },
  { xBytes: 13935, factor: 1.06 },
  { xBytes: 13964, factor: 1.06 },
  { xBytes: 21873, factor: 1.06 },
  { xBytes: 21918, factor: 1.06 },
  { xBytes: 21976, factor: 1.19 },
  { xBytes: 34192, factor: 1.704 },
  { xBytes: 34556, factor: 1.127 },
  { xBytes: 34786, factor: 1.19 },
  { xBytes: 49010, factor: 1.704 },
  { xBytes: 49726, factor: 1.179 },
  { xBytes: 49745, factor: 1.167 },
  { xBytes: 56247, factor: 1.167 },
  { xBytes: 56493, factor: 1.15 },
  { xBytes: 56680, factor: 1.15 },
];

export const TOKEN_COST_SAMPLES: ReadonlyArray<CurveSample> = [
  { xBytes: 5935, factor: 2.558 },
  { xBytes: 5975, factor: 2.801 },
  { xBytes: 5978, factor: 2.731 },
  { xBytes: 13777, factor: 2.504 },
  { xBytes: 13935, factor: 2.927 },
  { xBytes: 13964, factor: 3.085 },
  { xBytes: 21873, factor: 2.444 },
  { xBytes: 21918, factor: 2.723 },
  { xBytes: 21976, factor: 2.011 },
  { xBytes: 34192, factor: 1.252 },
  { xBytes: 34556, factor: 2.301 },
  { xBytes: 34786, factor: 2.868 },
  { xBytes: 49010, factor: 1.0 },
  { xBytes: 49726, factor: 1.712 },
  { xBytes: 49745, factor: 1.924 },
  { xBytes: 56247, factor: 1.751 },
  { xBytes: 56493, factor: 1.827 },
  { xBytes: 56680, factor: 2.413 },
];

/**
 * Regression form for the curve fit. Linear-log (degree 1, x→log(x)) is the
 * default per #179 leg-1 finding: linear-log beat poly2-raw on both curves
 * (accuracy p=0.097 vs 0.111, token-cost p=0.176 vs 0.404 at n=18) and uses
 * one fewer parameter, so degrees-of-freedom remain comfortable at the
 * sample counts typical for this study (n ≤ 20).
 */
export const CONTEXT_COST_REGRESSION_DEGREE = 1;
export const CONTEXT_COST_REGRESSION_X_TRANSFORM: "identity" | "log" = "log";

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
      CONTEXT_COST_REGRESSION_X_TRANSFORM,
    );
  }
  return cachedAccuracy;
}

function getTokenCost(): PolynomialRegression {
  if (!cachedTokenCost) {
    cachedTokenCost = fitPolynomialRegression(
      [...TOKEN_COST_SAMPLES],
      CONTEXT_COST_REGRESSION_DEGREE,
      CONTEXT_COST_REGRESSION_X_TRANSFORM,
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
 * Combines both curves under the chosen weights AFTER range-normalizing each
 * to [1, 2] over its calibration sample range. Without normalization the
 * accuracy curve's natural range (e.g. 1.0–6.0) would dominate the
 * token-cost curve's narrower range (1.0–1.4) regardless of weights — the
 * stated 75/25 wouldn't match the empirical contribution.
 *
 * Normalization:
 *   accNorm(x)  = 1 + (accuracyDegradationFactor(x)  − 1) / (accuracyMax  − 1)
 *   tcNorm(x)   = 1 + (tokenCostFactor(x)            − 1) / (tokenCostMax − 1)
 *
 * accuracyMax / tokenCostMax come from the largest factor in each curve's
 * SAMPLE array — known constants, not the runtime regression. Inputs in the
 * calibration range produce normalized factors in [1, 2]; extrapolations
 * past the largest sample exceed 2.
 *
 * If a curve is flat (max factor = 1), its normalized contribution is 1
 * everywhere (no signal in that dimension; the other curve dominates).
 *
 * The composite returns a factor ≥ 1 over the calibration range; the
 * weights' empirical contributions match their stated values because both
 * curves have been brought to a common dynamic range.
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
  const accNorm = normalizedAccuracyFactor(totalBytes, opts);
  const tcNorm = normalizedTokenCostFactor(totalBytes, opts);
  return w.accuracy * accNorm + w.cost * tcNorm;
}

/**
 * Range-normalized accuracy-degradation factor: maps the curve's
 * [1, accuracyMax] range to [1, 2]. Returns 1 everywhere for flat curves.
 * Used internally by {@link contextCostFactor}; exposed for diagnostics.
 */
export function normalizedAccuracyFactor(
  totalBytes: number,
  opts?: { clampHigh?: boolean },
): number {
  const raw = accuracyDegradationFactor(totalBytes, opts);
  return rangeNormalize(raw, sampleMaxFactor(ACCURACY_DEGRADATION_SAMPLES));
}

/**
 * Range-normalized token-cost factor: maps the curve's [1, tokenCostMax]
 * range to [1, 2]. Returns 1 everywhere for flat curves.
 */
export function normalizedTokenCostFactor(
  totalBytes: number,
  opts?: { clampHigh?: boolean },
): number {
  const raw = tokenCostFactor(totalBytes, opts);
  return rangeNormalize(raw, sampleMaxFactor(TOKEN_COST_SAMPLES));
}

function sampleMaxFactor(samples: ReadonlyArray<CurveSample>): number {
  return samples.reduce((m, s) => (s.factor > m ? s.factor : m), 1);
}

function rangeNormalize(rawFactor: number, sampleMax: number): number {
  if (sampleMax <= 1 + 1e-9) return 1; // flat curve
  return 1 + (rawFactor - 1) / (sampleMax - 1);
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
