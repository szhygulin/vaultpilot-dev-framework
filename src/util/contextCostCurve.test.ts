import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTEXT_COST_BREAKPOINTS,
  contextCostFactor,
  resetContextCostCurveCache,
} from "./contextCostCurve.js";

test("CONTEXT_COST_BREAKPOINTS: factors are monotone non-decreasing in size", () => {
  for (let i = 1; i < CONTEXT_COST_BREAKPOINTS.length; i++) {
    const prev = CONTEXT_COST_BREAKPOINTS[i - 1];
    const cur = CONTEXT_COST_BREAKPOINTS[i];
    assert.ok(cur.xBytes > prev.xBytes, `xBytes not strictly increasing at ${i}`);
    assert.ok(cur.factor >= prev.factor, `factor not monotone at ${i}`);
  }
});

test("contextCostFactor: returns each breakpoint's factor exactly", () => {
  resetContextCostCurveCache();
  for (const bp of CONTEXT_COST_BREAKPOINTS) {
    const f = contextCostFactor(bp.xBytes);
    assert.ok(Math.abs(f - bp.factor) < 1e-6, `at ${bp.xBytes}: ${f} vs ${bp.factor}`);
  }
});

test("contextCostFactor: clamps below the first breakpoint to factor>=1", () => {
  resetContextCostCurveCache();
  const f = contextCostFactor(0);
  assert.ok(f >= 1, `expected >=1, got ${f}`);
});

test("contextCostFactor: clampHigh bounds extrapolation", () => {
  resetContextCostCurveCache();
  const last = CONTEXT_COST_BREAKPOINTS[CONTEXT_COST_BREAKPOINTS.length - 1];
  const f = contextCostFactor(last.xBytes * 4, { clampHigh: true });
  assert.equal(f, last.factor);
});

test("contextCostFactor: never returns NaN for in-range bytes", () => {
  resetContextCostCurveCache();
  const lo = CONTEXT_COST_BREAKPOINTS[0].xBytes;
  const hi = CONTEXT_COST_BREAKPOINTS[CONTEXT_COST_BREAKPOINTS.length - 1].xBytes;
  for (let x = lo; x <= hi; x += 512) {
    const f = contextCostFactor(x);
    assert.ok(!Number.isNaN(f) && Number.isFinite(f), `NaN/inf at x=${x}`);
    assert.ok(f >= 1, `factor < 1 at x=${x}: ${f}`);
  }
});
