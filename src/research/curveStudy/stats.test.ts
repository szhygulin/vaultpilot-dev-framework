import { test } from "node:test";
import assert from "node:assert/strict";
import { betaInc, fRightTailPValue, logGamma, tTwoSidedPValue } from "./stats.js";

const close = (a: number, b: number, eps = 1e-5): boolean => Math.abs(a - b) < eps;

test("logGamma: known integer factorial values", () => {
  // log Γ(n) = log((n-1)!)
  assert.ok(close(logGamma(1), 0)); // log 0! = log 1 = 0
  assert.ok(close(logGamma(2), 0)); // log 1! = 0
  assert.ok(close(logGamma(3), Math.log(2))); // log 2! = log 2
  assert.ok(close(logGamma(5), Math.log(24)));
});

test("betaInc: I_0.5(1, 1) = 0.5 (uniform CDF at 0.5)", () => {
  assert.ok(close(betaInc(0.5, 1, 1), 0.5));
});

test("betaInc: I_x(a, b) symmetry — I_x(a, b) + I_{1-x}(b, a) = 1", () => {
  for (const [x, a, b] of [
    [0.3, 2, 4],
    [0.7, 5, 3],
    [0.1, 1.5, 2.5],
  ]) {
    const sum = betaInc(x, a, b) + betaInc(1 - x, b, a);
    assert.ok(close(sum, 1, 1e-9), `sum=${sum} at (${x},${a},${b})`);
  }
});

test("tTwoSidedPValue: t=0 yields p=1", () => {
  for (const df of [1, 5, 10, 100]) {
    assert.ok(close(tTwoSidedPValue(0, df), 1));
  }
});

test("tTwoSidedPValue: matches known reference values", () => {
  // Reference values from scipy.stats.t.sf(t, df) * 2
  // t=2.0, df=10 -> 0.0733569
  assert.ok(close(tTwoSidedPValue(2.0, 10), 0.0733569, 1e-4));
  // t=1.96, df=1000 -> 0.0502 (close to normal limit)
  assert.ok(close(tTwoSidedPValue(1.96, 1000), 0.0502, 1e-3));
  // t=2.776, df=4 -> 0.05 (95% critical value)
  assert.ok(close(tTwoSidedPValue(2.776, 4), 0.05, 1e-3));
});

test("tTwoSidedPValue: large |t| yields tiny p", () => {
  assert.ok(tTwoSidedPValue(10, 20) < 1e-6);
});

test("fRightTailPValue: f=0 yields p=1", () => {
  assert.ok(close(fRightTailPValue(0, 2, 10), 1));
});

test("fRightTailPValue: matches known reference values", () => {
  // Reference values from scipy.stats.f.sf(f, df1, df2)
  // F=4.0, df1=2, df2=10 -> 0.05307
  assert.ok(close(fRightTailPValue(4.0, 2, 10), 0.05307, 1e-3));
  // F=3.49, df1=2, df2=20 -> 0.05 (5% critical value)
  assert.ok(close(fRightTailPValue(3.49, 2, 20), 0.05, 5e-3));
  // F=1.0, df1=5, df2=5 -> 0.5 (median of F(5,5) is 1)
  assert.ok(close(fRightTailPValue(1.0, 5, 5), 0.5, 1e-3));
});

test("fRightTailPValue: huge F yields tiny p", () => {
  assert.ok(fRightTailPValue(100, 2, 50) < 1e-9);
});
