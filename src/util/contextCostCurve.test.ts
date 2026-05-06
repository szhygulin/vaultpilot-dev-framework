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

test("getAccuracyDegradationRegression / getTokenCostRegression: both fit at degree 2 with finite F p-values", () => {
  resetContextCostCurveCache();
  for (const reg of [getAccuracyDegradationRegression(), getTokenCostRegression()]) {
    assert.equal(reg.degree, 2);
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

test("contextCostFactor: default weights produce a value between the two component factors", () => {
  resetContextCostCurveCache();
  const x = 24000;
  const acc = accuracyDegradationFactor(x);
  const tc = tokenCostFactor(x);
  const composite = contextCostFactor(x);
  const lo = Math.min(acc, tc);
  const hi = Math.max(acc, tc);
  // weighted sum lies between the two extremes (or equals when they match)
  assert.ok(composite >= lo - 1e-9 && composite <= hi + 1e-9, `${composite} not in [${lo},${hi}]`);
  // explicit check: 0.75·acc + 0.25·tc
  assert.ok(Math.abs(composite - (0.75 * acc + 0.25 * tc)) < 1e-9);
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

test("contextCostFactor: weights {1.0, 0.0} = pure accuracy curve", () => {
  resetContextCostCurveCache();
  const x = 24000;
  const acc = accuracyDegradationFactor(x);
  const composite = contextCostFactor(x, { weights: { accuracy: 1.0, cost: 0.0 } });
  assert.ok(Math.abs(composite - acc) < 1e-9);
});

test("contextCostFactor: weights {0.0, 1.0} = pure token-cost curve", () => {
  resetContextCostCurveCache();
  const x = 24000;
  const tc = tokenCostFactor(x);
  const composite = contextCostFactor(x, { weights: { accuracy: 0.0, cost: 1.0 } });
  assert.ok(Math.abs(composite - tc) < 1e-9);
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
    0.75 * accuracyDegradationFactor(Math.max(accMaxX, tcMaxX), { clampHigh: true }) +
    0.25 * tokenCostFactor(Math.max(accMaxX, tcMaxX), { clampHigh: true });
  // The clamped composite at far-x equals the composite at the max sample x
  // (each component is clamped to its own max, then weighted summed)
  assert.ok(capped <= compAtMax + 1e-6);
});
