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
 * Provenance: #179 phase 3 curve-redo, two-leg combined fit on 2026-05-07.
 * Coding cells: claude-sonnet-4-6. Reasoning judge: claude-opus-4-7[1m] at
 * K=3 medians. 18 trim agents (~6K/14K/22K/35K/50K/58K bytes × 3 seeds) ×
 * 13 issues (6 vp-mcp vitest + 7 vp-development-agents node-test) = 234
 * cells dispatched, 232 scored (2 envelope-parse-fail dropped). Quality is
 * the falsifiable 0–100 metric A+B (50-pt blinded reasoning judge + 50-pt
 * normalized hidden-test pass rate; 2A for pushback; 0 for parse fail) per
 * `feature-plans/curve-redo-bundle/curve-redo-combined-results.md`.
 *
 * Curve form: quadratic-raw (degree 2, identity transform). The redo's
 * combined dataset is non-monotone in log(bytes) — quality degrades from 6k
 * to 35k then recovers from 35k to 50k+ — so the prior linear-log default
 * fits with R²≈0 (accuracy F=0.12 p=0.737; token-cost F=0.49 p=0.495). A
 * sweep of degrees 1–3 × {log, identity} found quad-raw the simplest model
 * to capture the bend: accuracy F(2,15)=4.46 p=0.030 (R²adj=0.29), with
 * the quadratic coefficient alone at p=0.015. Token cost on the same form
 * gives F(2,15)=2.63 p=0.105 (R²adj=0.16); overall F doesn't clear 0.05
 * but the quadratic coefficient is individually significant at p=0.037.
 * Same functional form adopted for both curves so the runtime composite
 * shares one (degree, xTransform) constant pair.
 *
 * Re-fit when the orchestrator's primary coding model changes, when
 * calibrating a different specialty, or when extending sampling beyond the
 * current 6k–58k range (see ROADMAP "investigate sizes beyond 60KB").
 */
export const ACCURACY_DEGRADATION_SAMPLES: ReadonlyArray<CurveSample> = [
  { xBytes: 5935, factor: 1.0652 },
  { xBytes: 5975, factor: 1.0578 },
  { xBytes: 5978, factor: 1.0792 },
  { xBytes: 13777, factor: 1.1227 },
  { xBytes: 13935, factor: 1.0903 },
  { xBytes: 13964, factor: 1.0 },
  { xBytes: 21873, factor: 1.0843 },
  { xBytes: 21918, factor: 1.0726 },
  { xBytes: 21976, factor: 1.1419 },
  { xBytes: 34192, factor: 1.2106 },
  { xBytes: 34556, factor: 1.1647 },
  { xBytes: 34786, factor: 1.0871 },
  { xBytes: 49010, factor: 1.0358 },
  { xBytes: 49726, factor: 1.027 },
  { xBytes: 49745, factor: 1.0339 },
  { xBytes: 56247, factor: 1.07 },
  { xBytes: 56493, factor: 1.036 },
  { xBytes: 56680, factor: 1.0179 },
];

export const TOKEN_COST_SAMPLES: ReadonlyArray<CurveSample> = [
  { xBytes: 5935, factor: 1.2233 },
  { xBytes: 5975, factor: 1.0 },
  { xBytes: 5978, factor: 1.0493 },
  { xBytes: 13777, factor: 1.2248 },
  { xBytes: 13935, factor: 1.0932 },
  { xBytes: 13964, factor: 1.1906 },
  { xBytes: 21873, factor: 1.2226 },
  { xBytes: 21918, factor: 1.1711 },
  { xBytes: 21976, factor: 1.307 },
  { xBytes: 34192, factor: 1.1678 },
  { xBytes: 34556, factor: 1.3094 },
  { xBytes: 34786, factor: 1.1271 },
  { xBytes: 49010, factor: 1.1522 },
  { xBytes: 49726, factor: 1.1762 },
  { xBytes: 49745, factor: 1.0686 },
  { xBytes: 56247, factor: 1.1753 },
  { xBytes: 56493, factor: 1.0971 },
  { xBytes: 56680, factor: 1.154 },
];

/**
 * Regression form for the curve fit. Quadratic-raw (degree 2, x untransformed)
 * is the post-redo default — see provenance comment on
 * {@link ACCURACY_DEGRADATION_SAMPLES} for the model-sweep rationale and the
 * non-monotone-in-log(bytes) shape of the calibration data.
 */
export const CONTEXT_COST_REGRESSION_DEGREE = 2;
export const CONTEXT_COST_REGRESSION_X_TRANSFORM: "identity" | "log" = "identity";

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

/**
 * Soft-warning byte threshold for per-agent CLAUDE.md size (#200, option 1
 * scope after Markov's pushback). Returns the 95th-percentile of the
 * calibration sample's xBytes — a deliberately model-free statistic, not
 * an "elbow." The post-redo fit is quadratic-raw (degree 2, identity
 * transform) with an inflection inside the calibration range, so any
 * model-derived single x-value would now reflect the curve's bend rather
 * than a "danger" boundary; the model-free p95 stays the right shape.
 *
 * Properties:
 *   - Model-free: drawn from the ordered sample bytes via R-7 linear
 *     interpolation (matches Excel/numpy default), so the threshold moves
 *     with the calibration data without depending on the regression form.
 *   - Above the typical sample density: by construction p95 sits in the
 *     upper tail of the existing measurements, so warnings fire only at
 *     empirically-attested-as-large sizes.
 *   - Below {@link SOFT_CAP_BYTES} (64 KiB): the existing hard cap still
 *     blocks the append; this warning surfaces approach-to-cap.
 *
 * Used by `runIssueCore.maybeAppendSummary` to emit a
 * `specialization.budget_warning` log event after a successful append when
 * the post-append byte count meets/exceeds the threshold. No enforcement
 * and no victim-eviction here — both deferred per #200's bake-window note
 * (needs a validated utility-signal study to drive forced eviction).
 */
export function byteBudgetWarningThreshold(): number {
  const xs = ACCURACY_DEGRADATION_SAMPLES.map((s) => s.xBytes).sort(
    (a, b) => a - b,
  );
  return Math.round(percentile(xs, 0.95));
}

/**
 * Memoized value of {@link byteBudgetWarningThreshold} for hot-path callers.
 * The samples are immutable at module load, so a single computation suffices.
 * Exported separately from the function so diagnostics tooling can inline
 * the constant while tests retain a recomputation seam.
 */
export const BYTE_BUDGET_WARNING_THRESHOLD: number = byteBudgetWarningThreshold();

/**
 * R-7 percentile (numpy / Excel default): linear interpolation between
 * adjacent order statistics. `sorted` MUST already be ascending. `p` in [0, 1].
 * Returns 0 on empty input (caller-facing helpers don't pass empty arrays;
 * the guard is defensive).
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
}
