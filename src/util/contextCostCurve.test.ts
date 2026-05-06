import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTEXT_COST_SAMPLES,
  contextCostFactor,
  getContextCostRegression,
  resetContextCostCurveCache,
} from "./contextCostCurve.js";

test("CONTEXT_COST_SAMPLES: factors are monotone non-decreasing in xBytes", () => {
  const sorted = [...CONTEXT_COST_SAMPLES].sort((a, b) => a.xBytes - b.xBytes);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i].factor >= sorted[i - 1].factor, `non-monotone at i=${i}`);
  }
});

test("getContextCostRegression: degree 2, R² above 0.9 on the seeded samples", () => {
  resetContextCostCurveCache();
  const reg = getContextCostRegression();
  assert.equal(reg.degree, 2);
  assert.ok(reg.rSquared > 0.9, `R²=${reg.rSquared}`);
});

test("getContextCostRegression: significance fields populated and finite", () => {
  resetContextCostCurveCache();
  const reg = getContextCostRegression();
  const sig = reg.significance;
  assert.ok(Number.isFinite(sig.fStatistic), `F=${sig.fStatistic}`);
  assert.ok(Number.isFinite(sig.fPValue), `F p-value=${sig.fPValue}`);
  assert.equal(sig.coefficients.length, reg.degree + 1);
  assert.equal(sig.fDfRegression, reg.degree);
  assert.equal(sig.fDfResidual, reg.n - reg.degree - 1);
});

test("contextCostFactor: returns >= 1 across the full sample range", () => {
  resetContextCostCurveCache();
  const xs = CONTEXT_COST_SAMPLES.map((s) => s.xBytes);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  for (let x = lo; x <= hi; x += 512) {
    const f = contextCostFactor(x);
    assert.ok(!Number.isNaN(f) && Number.isFinite(f), `NaN/inf at x=${x}`);
    assert.ok(f >= 1, `factor < 1 at x=${x}: ${f}`);
  }
});

test("contextCostFactor: clamps below the smallest sample to factor>=1", () => {
  resetContextCostCurveCache();
  const f = contextCostFactor(0);
  assert.ok(f >= 1, `expected >=1, got ${f}`);
});

test("contextCostFactor: clampHigh caps at the predicted value at the largest sample", () => {
  resetContextCostCurveCache();
  const xs = CONTEXT_COST_SAMPLES.map((s) => s.xBytes);
  const hi = Math.max(...xs);
  const capped = contextCostFactor(hi * 4, { clampHigh: true });
  const atTop = contextCostFactor(hi);
  assert.ok(Math.abs(capped - atTop) < 1e-6, `clampHigh=${capped} should equal atTop=${atTop}`);
});

test("contextCostFactor: regression is monotone-increasing across sample range (concave-up shape)", () => {
  resetContextCostCurveCache();
  const xs = CONTEXT_COST_SAMPLES.map((s) => s.xBytes);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  let prev = contextCostFactor(lo);
  for (let x = lo + 1024; x <= hi; x += 1024) {
    const f = contextCostFactor(x);
    // Allow tiny negative slope (numerical jitter) but flag larger drops as a regression-shape regression
    assert.ok(f >= prev - 0.01, `regression dipped at x=${x}: ${prev} -> ${f}`);
    prev = f;
  }
});
