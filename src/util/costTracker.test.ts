import { test } from "node:test";
import assert from "node:assert/strict";
import { RunCostTracker, resolveBudgetUsd } from "./costTracker.js";

test("RunCostTracker: starts at zero", () => {
  const t = new RunCostTracker();
  assert.equal(t.total(), 0);
});

test("RunCostTracker: accumulates positive values", () => {
  const t = new RunCostTracker();
  t.add(0.25);
  t.add(0.75);
  t.add(1.5);
  assert.equal(t.total(), 2.5);
});

test("RunCostTracker: ignores undefined / null / NaN / Infinity / negative", () => {
  const t = new RunCostTracker();
  t.add(undefined);
  t.add(null);
  t.add(Number.NaN);
  t.add(Number.POSITIVE_INFINITY);
  t.add(Number.NEGATIVE_INFINITY);
  t.add(-1);
  t.add(-0.001);
  assert.equal(t.total(), 0);
  // A real cost still accumulates after garbage readings.
  t.add(1.5);
  assert.equal(t.total(), 1.5);
});

test("RunCostTracker: zero is a valid no-op cost", () => {
  const t = new RunCostTracker();
  t.add(0);
  t.add(0);
  assert.equal(t.total(), 0);
});

test("RunCostTracker: exceedsBudget — strict greater-than", () => {
  const t = new RunCostTracker();
  t.add(5);
  // accumulated == budget → not exceeding (strict >).
  assert.equal(t.exceedsBudget(5), false);
  assert.equal(t.exceedsBudget(5.01), false);
  assert.equal(t.exceedsBudget(4.99), true);
});

test("RunCostTracker: exceedsBudget — empty tracker never exceeds", () => {
  const t = new RunCostTracker();
  assert.equal(t.exceedsBudget(0), false);
  assert.equal(t.exceedsBudget(10), false);
});

test("RunCostTracker: exceedsBudget — malformed budget returns false", () => {
  const t = new RunCostTracker();
  t.add(100);
  assert.equal(t.exceedsBudget(Number.NaN), false);
  assert.equal(t.exceedsBudget(Number.POSITIVE_INFINITY), false);
  assert.equal(t.exceedsBudget(-1), false);
});

test("resolveBudgetUsd: undefined when neither flag nor env set", () => {
  assert.equal(resolveBudgetUsd({ flag: undefined, env: {} }), undefined);
});

test("resolveBudgetUsd: parses numeric flag", () => {
  assert.equal(resolveBudgetUsd({ flag: "5.0", env: {} }), 5.0);
  assert.equal(resolveBudgetUsd({ flag: "0.25", env: {} }), 0.25);
  assert.equal(resolveBudgetUsd({ flag: 7, env: {} }), 7);
});

test("resolveBudgetUsd: flag wins over env", () => {
  assert.equal(
    resolveBudgetUsd({ flag: "1.5", env: { VP_DEV_MAX_COST_USD: "10" } }),
    1.5,
  );
});

test("resolveBudgetUsd: env fallback when flag absent", () => {
  assert.equal(
    resolveBudgetUsd({ flag: undefined, env: { VP_DEV_MAX_COST_USD: "3.5" } }),
    3.5,
  );
});

test("resolveBudgetUsd: rejects empty / whitespace / non-finite / negative", () => {
  assert.equal(resolveBudgetUsd({ flag: "", env: {} }), undefined);
  assert.equal(resolveBudgetUsd({ flag: "   ", env: {} }), undefined);
  assert.equal(resolveBudgetUsd({ flag: "abc", env: {} }), undefined);
  assert.equal(resolveBudgetUsd({ flag: "-1", env: {} }), undefined);
  assert.equal(resolveBudgetUsd({ flag: "Infinity", env: {} }), undefined);
  assert.equal(
    resolveBudgetUsd({ flag: undefined, env: { VP_DEV_MAX_COST_USD: "" } }),
    undefined,
  );
  assert.equal(
    resolveBudgetUsd({ flag: undefined, env: { VP_DEV_MAX_COST_USD: "junk" } }),
    undefined,
  );
});

test("resolveBudgetUsd: zero is valid (Phase-2 decides semantics)", () => {
  // Phase 1 must accept "--max-cost-usd 0" without erroring; what it MEANS
  // (always-abort vs no-op) is Phase 2's call. The tracker just records.
  assert.equal(resolveBudgetUsd({ flag: "0", env: {} }), 0);
  assert.equal(resolveBudgetUsd({ flag: 0, env: {} }), 0);
});
