import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCURACY_DEGRADATION_SAMPLES,
  DEFAULT_COST_WEIGHTS,
  TOKEN_COST_SAMPLES,
  accuracyDegradationFactor,
  contextCostFactor,
  getAccuracyDegradationRegression,
  getTokenCostRegression,
  normalizedAccuracyFactor,
  normalizedTokenCostFactor,
  resetContextCostCurveCache,
  tokenCostFactor,
} from "./contextCostCurve.js";

test("samples: both curves are monotone non-decreasing in xBytes", () => {
  for (const arr of [ACCURACY_DEGRADATION_SAMPLES, TOKEN_COST_SAMPLES]) {
    const sorted = [...arr].sort((a, b) => a.xBytes - b.xBytes);
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(sorted[i].factor >= sorted[i - 1].factor, `non-monotone at i=${i}`);
    }
  }
});

test("DEFAULT_COST_WEIGHTS: sum to 1.0 and accuracy weight = 0.75", () => {
  assert.equal(DEFAULT_COST_WEIGHTS.accuracy, 0.75);
  assert.equal(DEFAULT_COST_WEIGHTS.cost, 0.25);
  assert.ok(Math.abs(DEFAULT_COST_WEIGHTS.accuracy + DEFAULT_COST_WEIGHTS.cost - 1) < 1e-9);
});

test("getAccuracyDegradationRegression / getTokenCostRegression: both fit linear-log with finite F p-values", () => {
  resetContextCostCurveCache();
  for (const reg of [getAccuracyDegradationRegression(), getTokenCostRegression()]) {
    assert.equal(reg.degree, 1);
    assert.equal(reg.xTransform, "log");
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

test("normalizedAccuracyFactor: largest training x maps near the [1,2] ceiling", () => {
  resetContextCostCurveCache();
  const maxX = ACCURACY_DEGRADATION_SAMPLES.reduce((m, s) => (s.factor > m.factor ? s : m), ACCURACY_DEGRADATION_SAMPLES[0]).xBytes;
  const norm = normalizedAccuracyFactor(maxX);
  // Linear-log doesn't interpolate concave-up training data, so the prediction
  // at the largest training x sits at-or-below sampleMax. Tolerance accounts
  // for the fit shape's residual at the upper bound. The contract being
  // checked is "rangeNormalize maps [1, sampleMax] to [1, 2]" — exact 2.0
  // happens only when the regression interpolates the sampleMax point.
  assert.ok(norm > 1.5 && norm <= 2.0 + 1e-2, `norm=${norm} at largest sample`);
});

test("normalizedTokenCostFactor: largest training x maps near the [1,2] ceiling", () => {
  resetContextCostCurveCache();
  const maxX = TOKEN_COST_SAMPLES.reduce((m, s) => (s.factor > m.factor ? s : m), TOKEN_COST_SAMPLES[0]).xBytes;
  const norm = normalizedTokenCostFactor(maxX);
  assert.ok(norm > 1.5 && norm <= 2.0 + 1e-2, `norm=${norm} at largest sample`);
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
