import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCURACY_DEGRADATION_SAMPLES,
  BYTE_BUDGET_WARNING_THRESHOLD,
  DEFAULT_COST_WEIGHTS,
  TOKEN_COST_SAMPLES,
  accuracyDegradationFactor,
  byteBudgetWarningThreshold,
  contextCostFactor,
  getAccuracyDegradationRegression,
  getTokenCostRegression,
  normalizedAccuracyFactor,
  normalizedTokenCostFactor,
  resetContextCostCurveCache,
  tokenCostFactor,
} from "./contextCostCurve.js";
import { SOFT_CAP_BYTES } from "../agent/specialization.js";

test("samples: both curves have factor >= 1 at every sample (normalized to cheapest=1.0)", () => {
  for (const arr of [ACCURACY_DEGRADATION_SAMPLES, TOKEN_COST_SAMPLES]) {
    for (const s of arr) {
      assert.ok(s.factor >= 1 - 1e-9, `factor<1 at xBytes=${s.xBytes}: ${s.factor}`);
    }
  }
});

test("DEFAULT_COST_WEIGHTS: sum to 1.0 and accuracy weight = 0.75", () => {
  assert.equal(DEFAULT_COST_WEIGHTS.accuracy, 0.75);
  assert.equal(DEFAULT_COST_WEIGHTS.cost, 0.25);
  assert.ok(Math.abs(DEFAULT_COST_WEIGHTS.accuracy + DEFAULT_COST_WEIGHTS.cost - 1) < 1e-9);
});

test("getAccuracyDegradationRegression / getTokenCostRegression: both fit quadratic-raw with finite F p-values", () => {
  resetContextCostCurveCache();
  for (const reg of [getAccuracyDegradationRegression(), getTokenCostRegression()]) {
    assert.equal(reg.degree, 2);
    assert.equal(reg.xTransform, "identity");
    assert.ok(Number.isFinite(reg.significance.fPValue));
  }
});

test("accuracyDegradationFactor and tokenCostFactor: both >= 1 across sample range", () => {
  resetContextCostCurveCache();
  for (const arr of [ACCURACY_DEGRADATION_SAMPLES, TOKEN_COST_SAMPLES]) {
    const xs = arr.map((s) => s.xBytes);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    for (let x = lo; x <= hi; x += 1024) {
      assert.ok(accuracyDegradationFactor(x) >= 1, `acc<1 at x=${x}`);
      assert.ok(tokenCostFactor(x) >= 1, `tc<1 at x=${x}`);
    }
  }
});

test("contextCostFactor: default weights produce a value in [1, 2] across the calibration range", () => {
  resetContextCostCurveCache();
  const xs = [
    ...ACCURACY_DEGRADATION_SAMPLES.map((s) => s.xBytes),
    ...TOKEN_COST_SAMPLES.map((s) => s.xBytes),
  ];
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  for (let x = lo; x <= hi; x += 1024) {
    const composite = contextCostFactor(x);
    assert.ok(composite >= 1 - 1e-9, `composite < 1 at x=${x}: ${composite}`);
    assert.ok(composite <= 2 + 1e-3, `composite > 2 at x=${x}: ${composite}`);
  }
});

test("contextCostFactor: composite equals weighted sum of normalized factors", () => {
  resetContextCostCurveCache();
  const x = 24000;
  const accN = normalizedAccuracyFactor(x);
  const tcN = normalizedTokenCostFactor(x);
  const composite = contextCostFactor(x);
  assert.ok(Math.abs(composite - (0.75 * accN + 0.25 * tcN)) < 1e-9);
});

test("normalizedAccuracyFactor: stays within [1, 2 + ε] at the largest training x", () => {
  resetContextCostCurveCache();
  const maxX = ACCURACY_DEGRADATION_SAMPLES.reduce((m, s) => (s.factor > m.factor ? s : m), ACCURACY_DEGRADATION_SAMPLES[0]).xBytes;
  const norm = normalizedAccuracyFactor(maxX);
  // Range-normalize maps [1, sampleMax] to [1, 2]; the regression's prediction
  // at the largest-factor sample's x depends on fit strength. Weak fits
  // (low R²) produce predictions well below sampleMax — the contract checked
  // here is just "stays in the normalized range," not "reaches the ceiling."
  assert.ok(norm >= 1 - 1e-9 && norm <= 2.0 + 1e-2, `norm=${norm} at largest sample`);
});

test("normalizedTokenCostFactor: stays within [1, 2 + ε] at the largest training x", () => {
  resetContextCostCurveCache();
  const maxX = TOKEN_COST_SAMPLES.reduce((m, s) => (s.factor > m.factor ? s : m), TOKEN_COST_SAMPLES[0]).xBytes;
  const norm = normalizedTokenCostFactor(maxX);
  assert.ok(norm >= 1 - 1e-9 && norm <= 2.0 + 1e-2, `norm=${norm} at largest sample`);
});

test("contextCostFactor: weights {0.5, 0.5} approach 2.0 at the size where both curves peak", () => {
  resetContextCostCurveCache();
  const accMaxX = ACCURACY_DEGRADATION_SAMPLES.reduce((m, s) => (s.factor > m.factor ? s : m), ACCURACY_DEGRADATION_SAMPLES[0]).xBytes;
  const tcMaxX = TOKEN_COST_SAMPLES.reduce((m, s) => (s.factor > m.factor ? s : m), TOKEN_COST_SAMPLES[0]).xBytes;
  if (accMaxX === tcMaxX) {
    const composite = contextCostFactor(accMaxX, { weights: { accuracy: 0.5, cost: 0.5 } });
    // Same non-interpolation note as above — composite is the weighted sum
    // of two normalized factors that each individually sit in [1, 2] but
    // don't necessarily hit 2.0 exactly under linear-log.
    assert.ok(composite > 1.5 && composite <= 2.0 + 1e-2, `composite=${composite}`);
  }
});

test("contextCostFactor: rejects weights that don't sum to 1.0", () => {
  resetContextCostCurveCache();
  assert.throws(() =>
    contextCostFactor(24000, { weights: { accuracy: 0.5, cost: 0.4 } }),
  );
  assert.throws(() =>
    contextCostFactor(24000, { weights: { accuracy: 0.6, cost: 0.6 } }),
  );
});

test("contextCostFactor: weights {1.0, 0.0} = pure NORMALIZED accuracy curve", () => {
  resetContextCostCurveCache();
  const x = 24000;
  const accN = normalizedAccuracyFactor(x);
  const composite = contextCostFactor(x, { weights: { accuracy: 1.0, cost: 0.0 } });
  assert.ok(Math.abs(composite - accN) < 1e-9);
});

test("contextCostFactor: weights {0.0, 1.0} = pure NORMALIZED token-cost curve", () => {
  resetContextCostCurveCache();
  const x = 24000;
  const tcN = normalizedTokenCostFactor(x);
  const composite = contextCostFactor(x, { weights: { accuracy: 0.0, cost: 1.0 } });
  assert.ok(Math.abs(composite - tcN) < 1e-9);
});

test("contextCostFactor: rejects negative weights", () => {
  resetContextCostCurveCache();
  assert.throws(() =>
    contextCostFactor(24000, { weights: { accuracy: 1.5, cost: -0.5 } }),
  );
});

// ---------------------------------------------------------------------------
// Soft byte-budget warning threshold (#200, option 1 scope).
// ---------------------------------------------------------------------------

test("byteBudgetWarningThreshold: equals R-7 p95 of ACCURACY_DEGRADATION_SAMPLES.xBytes", () => {
  // Independent recomputation: sort the bytes asc, linearly interpolate at
  // rank = 0.95 * (n-1). For n=18 the rank is 16.15, between order-stats
  // 16 and 17. Round to integer to match the threshold's representation.
  const xs = ACCURACY_DEGRADATION_SAMPLES.map((s) => s.xBytes).sort(
    (a, b) => a - b,
  );
  const rank = 0.95 * (xs.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const frac = rank - lo;
  const expected = Math.round(
    lo === hi ? xs[lo] : xs[lo] + frac * (xs[hi] - xs[lo]),
  );
  assert.equal(byteBudgetWarningThreshold(), expected);
  assert.equal(BYTE_BUDGET_WARNING_THRESHOLD, expected);
});

test("BYTE_BUDGET_WARNING_THRESHOLD: sits below the hard SOFT_CAP_BYTES so warnings precede the cap", () => {
  // The whole point of a soft warning is that it fires BEFORE the existing
  // hard cap blocks the append; otherwise operators only see the cap event
  // and never get an early heads-up.
  assert.ok(
    BYTE_BUDGET_WARNING_THRESHOLD < SOFT_CAP_BYTES,
    `threshold ${BYTE_BUDGET_WARNING_THRESHOLD} must be < SOFT_CAP_BYTES ${SOFT_CAP_BYTES}`,
  );
});

test("BYTE_BUDGET_WARNING_THRESHOLD: sits within the calibration sample range (not extrapolation)", () => {
  // The threshold is a percentile of measured sample bytes — by
  // construction it lies between min and max of the samples. Guarding
  // against an off-by-one in the percentile helper that would push the
  // value outside the sample range.
  const xs = ACCURACY_DEGRADATION_SAMPLES.map((s) => s.xBytes);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  assert.ok(BYTE_BUDGET_WARNING_THRESHOLD >= lo);
  assert.ok(BYTE_BUDGET_WARNING_THRESHOLD <= hi);
});

test("byteBudgetWarningThreshold: idempotent across calls (stateless on the immutable sample array)", () => {
  const a = byteBudgetWarningThreshold();
  const b = byteBudgetWarningThreshold();
  assert.equal(a, b);
});

test("contextCostFactor: clampHigh propagates to both component curves", () => {
  resetContextCostCurveCache();
  const accMaxX = Math.max(...ACCURACY_DEGRADATION_SAMPLES.map((s) => s.xBytes));
  const tcMaxX = Math.max(...TOKEN_COST_SAMPLES.map((s) => s.xBytes));
  const farX = Math.max(accMaxX, tcMaxX) * 4;
  const capped = contextCostFactor(farX, { clampHigh: true });
  const compAtMax =
    0.75 * normalizedAccuracyFactor(Math.max(accMaxX, tcMaxX), { clampHigh: true }) +
    0.25 * normalizedTokenCostFactor(Math.max(accMaxX, tcMaxX), { clampHigh: true });
  // The clamped composite at far-x equals the composite at the max sample x
  // (each component is clamped to its own max, then weighted summed)
  assert.ok(capped <= compAtMax + 1e-6);
});
