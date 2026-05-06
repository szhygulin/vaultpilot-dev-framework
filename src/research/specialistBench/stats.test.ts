import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coefficientOfVariation,
  hedgesG,
  holmBonferroni,
  mean,
  median,
  standardNormalCdf,
  wilcoxonSignedRankPaired,
} from "./stats.js";

// --------------------------------------------------------------------
// standardNormalCdf
// --------------------------------------------------------------------

test("standardNormalCdf: matches known values within tolerance", () => {
  assert.ok(Math.abs(standardNormalCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(standardNormalCdf(1) - 0.8413447) < 1e-5);
  assert.ok(Math.abs(standardNormalCdf(-1) - 0.1586553) < 1e-5);
  assert.ok(Math.abs(standardNormalCdf(1.96) - 0.9750021) < 1e-5);
  assert.ok(standardNormalCdf(5) > 0.9999); // tail check
  assert.ok(standardNormalCdf(-5) < 0.0001);
});

// --------------------------------------------------------------------
// median + mean
// --------------------------------------------------------------------

test("median: odd-count returns middle", () => {
  assert.equal(median([1, 2, 3, 4, 5]), 3);
});

test("median: even-count averages the two middles", () => {
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test("median: empty returns NaN", () => {
  assert.ok(Number.isNaN(median([])));
});

test("mean: standard cases", () => {
  assert.equal(mean([1, 2, 3]), 2);
  assert.equal(mean([10]), 10);
  assert.ok(Number.isNaN(mean([])));
});

// --------------------------------------------------------------------
// Wilcoxon signed-rank
// --------------------------------------------------------------------

test("wilcoxonSignedRankPaired: empty + all-zeros → p=1", () => {
  const r1 = wilcoxonSignedRankPaired([], "less");
  assert.equal(r1.n, 0);
  assert.equal(r1.pValue, 1);
  const r2 = wilcoxonSignedRankPaired([0, 0, 0], "less");
  assert.equal(r2.n, 0);
  assert.equal(r2.pValue, 1);
});

test("wilcoxonSignedRankPaired: textbook example — small effect, n=10", () => {
  // Hollander-Wolfe page 38 worked example, modified.
  // Differences: [-3, -1, 2, 4, 5, 7, 8, 10, 12, 15]
  // 9 of 10 positive; one-sided H1: greater → p should be small.
  const diffs = [-3, -1, 2, 4, 5, 7, 8, 10, 12, 15];
  const r = wilcoxonSignedRankPaired(diffs, "greater");
  assert.equal(r.n, 10);
  // Mean-W under H0 = 10·11/4 = 27.5; observed wPlus should be much
  // larger (most ranks are positive) → z > 0 → p < 0.05.
  assert.ok(r.wPlus > r.wMinus);
  assert.ok(r.z > 0);
  assert.ok(r.pValue < 0.05, `expected p < 0.05, got ${r.pValue}`);
});

test("wilcoxonSignedRankPaired: all-positive differences, one-sided greater → small p", () => {
  const diffs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const r = wilcoxonSignedRankPaired(diffs, "greater");
  assert.equal(r.n, 13);
  assert.equal(r.wPlus, 91); // 1+2+...+13
  assert.equal(r.wMinus, 0);
  assert.ok(r.pValue < 0.001);
});

test("wilcoxonSignedRankPaired: all-negative differences, one-sided less → small p", () => {
  const diffs = [-1, -2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -12, -13];
  const r = wilcoxonSignedRankPaired(diffs, "less");
  assert.equal(r.n, 13);
  assert.equal(r.wPlus, 0);
  assert.ok(r.pValue < 0.001);
});

test("wilcoxonSignedRankPaired: balanced positive/negative → p near 0.5", () => {
  // Balanced symmetric input — neither alternative should reject.
  const diffs = [-1, 1, -2, 2, -3, 3, -4, 4, -5, 5];
  const greater = wilcoxonSignedRankPaired(diffs, "greater");
  const less = wilcoxonSignedRankPaired(diffs, "less");
  assert.ok(greater.pValue > 0.3);
  assert.ok(less.pValue > 0.3);
});

test("wilcoxonSignedRankPaired: ties are averaged-ranked + variance-adjusted", () => {
  // Two pairs tied at |d|=1, two at |d|=2, two at |d|=3.
  const diffs = [1, 1, 2, -2, 3, 3];
  const r = wilcoxonSignedRankPaired(diffs, "greater");
  assert.equal(r.n, 6);
  // Expected ranks: |d|=1 pairs share rank (1+2)/2 = 1.5 each; |d|=2 pairs
  // share rank (3+4)/2 = 3.5 each; |d|=3 pairs share rank (5+6)/2 = 5.5 each.
  // wPlus = 1.5 + 1.5 + 3.5 + 5.5 + 5.5 = 17.5
  // wMinus = 3.5
  assert.equal(r.wPlus, 17.5);
  assert.equal(r.wMinus, 3.5);
});

test("wilcoxonSignedRankPaired: alternative='less' inverts the test", () => {
  const diffs = [-1, -2, -3, -4, -5, -6, -7, -8, -9, -10];
  const less = wilcoxonSignedRankPaired(diffs, "less");
  const greater = wilcoxonSignedRankPaired(diffs, "greater");
  assert.ok(less.pValue < 0.01); // we expect specialists < trim
  assert.ok(greater.pValue > 0.99); // opposite tail
});

// --------------------------------------------------------------------
// Holm-Bonferroni
// --------------------------------------------------------------------

test("holmBonferroni: empty input → empty output", () => {
  const r = holmBonferroni([], 0.05);
  assert.deepEqual(r.adjusted, []);
  assert.deepEqual(r.rejects, []);
});

test("holmBonferroni: single test → adjusted = raw", () => {
  const r = holmBonferroni([0.04], 0.05);
  assert.equal(r.adjusted[0], 0.04);
  assert.equal(r.rejects[0], true);
});

test("holmBonferroni: 2 tests with strong + weak signal", () => {
  // [0.001, 0.04] sorted: 0.001 first.
  // Step 1: 0.001 × 2 = 0.002 < 0.05 → reject.
  // Step 2: 0.04 × 1 = 0.04 < 0.05 → reject (still under alpha).
  const r = holmBonferroni([0.001, 0.04], 0.05);
  assert.deepEqual(r.adjusted, [0.002, 0.04]);
  assert.deepEqual(r.rejects, [true, true]);
});

test("holmBonferroni: 2 tests where second hits the gate", () => {
  // [0.03, 0.04]: sorted ascending, both small.
  // Step 1: 0.03 × 2 = 0.06 > 0.05 → no rejects.
  const r = holmBonferroni([0.03, 0.04], 0.05);
  // adjusted_(1) = 0.06 capped at 1, adjusted_(2) = max(0.06, 0.04) = 0.06
  // (monotonic step-down)
  assert.equal(r.adjusted[0], 0.06);
  assert.equal(r.adjusted[1], 0.06);
  assert.deepEqual(r.rejects, [false, false]);
});

test("holmBonferroni: 3 tests with mixed strength", () => {
  // p = [0.001, 0.02, 0.5]
  // sorted: 0.001, 0.02, 0.5
  // Step 1: 0.001 × 3 = 0.003 < 0.05 → reject. running_max = 0.003.
  // Step 2: 0.02 × 2 = 0.04 < 0.05 → reject. running_max = 0.04.
  // Step 3: 0.5 × 1 = 0.5 > 0.05 → no reject. running_max = 0.5.
  const r = holmBonferroni([0.001, 0.02, 0.5], 0.05);
  assert.deepEqual(r.adjusted, [0.003, 0.04, 0.5]);
  assert.deepEqual(r.rejects, [true, true, false]);
});

test("holmBonferroni: input order preserved in output", () => {
  // Original order: [0.5, 0.001, 0.02]
  // Sorted: 0.001 (idx 1), 0.02 (idx 2), 0.5 (idx 0)
  // Adjusted in sorted order: 0.003, 0.04, 0.5
  // Mapped back: idx 0 → 0.5, idx 1 → 0.003, idx 2 → 0.04
  const r = holmBonferroni([0.5, 0.001, 0.02], 0.05);
  assert.deepEqual(r.adjusted, [0.5, 0.003, 0.04]);
  assert.deepEqual(r.rejects, [false, true, true]);
});

// --------------------------------------------------------------------
// Hedges' g (paired)
// --------------------------------------------------------------------

test("hedgesG: empty / single → NaN", () => {
  assert.ok(Number.isNaN(hedgesG([])));
  assert.ok(Number.isNaN(hedgesG([1])));
});

test("hedgesG: zero-variance → NaN", () => {
  assert.ok(Number.isNaN(hedgesG([5, 5, 5, 5])));
});

test("hedgesG: positive mean shift → positive g, with bias correction", () => {
  // mean = 1.5, sd ≈ 0.577. Cohen's d ≈ 2.598.
  // J for n=4 = 1 - 3/(4·3 - 1) = 1 - 3/11 ≈ 0.7272.
  // Hedges' g ≈ 2.598 × 0.7272 ≈ 1.89.
  const g = hedgesG([1, 2, 1, 2]);
  assert.ok(g > 1.7 && g < 2.0, `expected ~1.89, got ${g}`);
});

test("hedgesG: bias correction shrinks toward zero (J < 1)", () => {
  // For any non-zero d, hedges' g is closer to 0 than cohen's d at small n.
  const diffs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const g = hedgesG(diffs);
  const d_uncorrected = mean(diffs) / Math.sqrt(diffs.reduce((a, b) => a + (b - mean(diffs)) ** 2, 0) / (diffs.length - 1));
  assert.ok(Math.abs(g) < Math.abs(d_uncorrected));
});

// --------------------------------------------------------------------
// Coefficient of variation
// --------------------------------------------------------------------

test("coefficientOfVariation: tight values → small CV", () => {
  const cv = coefficientOfVariation([10, 11, 9, 10.5]);
  assert.ok(cv < 0.15, `expected small CV, got ${cv}`);
});

test("coefficientOfVariation: spread values → large CV", () => {
  const cv = coefficientOfVariation([1, 5, 10, 20]);
  assert.ok(cv > 0.5, `expected large CV, got ${cv}`);
});

test("coefficientOfVariation: zero mean → NaN", () => {
  assert.ok(Number.isNaN(coefficientOfVariation([-1, 1, -2, 2])));
});

test("coefficientOfVariation: single value → NaN (no variance)", () => {
  assert.ok(Number.isNaN(coefficientOfVariation([5])));
});
