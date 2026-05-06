// Statistical primitives for the specialist-pick benchmark (#179
// experiment 2). Pure-TS, no external deps. Wilcoxon signed-rank +
// Holm-Bonferroni rejection ordering + Hedges' g (small-n bias-corrected
// Cohen's d).

// --------------------------------------------------------------------
// Wilcoxon signed-rank test, paired, one-sided
// --------------------------------------------------------------------

export type WilcoxonAlternative = "less" | "greater";

export interface WilcoxonResult {
  /** Number of non-zero pairs (zeros are dropped per Wilcoxon convention). */
  n: number;
  /** Sum of ranks of positive differences. */
  wPlus: number;
  /** Sum of ranks of negative differences. */
  wMinus: number;
  /** Z-score from the normal approximation with continuity correction. */
  z: number;
  /** One-sided p-value matching `alternative`. */
  pValue: number;
  alternative: WilcoxonAlternative;
}

/**
 * Wilcoxon signed-rank test, paired, one-sided. Uses the normal
 * approximation with continuity correction (defensible for n ≥ 10; n=13
 * in our use case is comfortably above the floor).
 *
 * `differences[i]` is the per-pair signed difference (e.g. specialist - trim).
 *
 *   alternative = "less"    → H1: median(d) < 0  (specialists are smaller, e.g. lower cost)
 *   alternative = "greater" → H1: median(d) > 0  (specialists are larger, e.g. higher quality)
 *
 * Two-sided p-values aren't part of the public surface — use the
 * one-sided then double if a two-sided question genuinely arises.
 *
 * Tie handling: when |d| values tie, each gets the average of the
 * positions they collectively occupy (standard practice). The variance
 * adjustment for ties (V = n(n+1)(2n+1)/24 - sum(t_i^3 - t_i)/48) is
 * applied so the test stays calibrated even with a few ties.
 */
export function wilcoxonSignedRankPaired(
  differences: ReadonlyArray<number>,
  alternative: WilcoxonAlternative,
): WilcoxonResult {
  // Drop zeros (Wilcoxon convention; zero pairs carry no signed
  // information).
  const nonZero = differences.filter((d) => d !== 0);
  const n = nonZero.length;
  if (n === 0) {
    return { n: 0, wPlus: 0, wMinus: 0, z: 0, pValue: 1, alternative };
  }
  // Rank |d| ascending with ties averaged.
  const indexed = nonZero.map((d, i) => ({ abs: Math.abs(d), sign: d > 0 ? 1 : -1, i }));
  indexed.sort((a, b) => a.abs - b.abs);

  // Walk runs of ties, assign average rank.
  const ranks: number[] = new Array(n);
  const tieGroupSizes: number[] = [];
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && indexed[j + 1].abs === indexed[i].abs) j++;
    const groupSize = j - i + 1;
    if (groupSize > 1) tieGroupSizes.push(groupSize);
    const avgRank = (i + j + 2) / 2; // (i+1 ... j+1) average; +2 because 1-indexed
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    i = j + 1;
  }

  let wPlus = 0;
  let wMinus = 0;
  for (let k = 0; k < n; k++) {
    if (indexed[k].sign > 0) wPlus += ranks[k];
    else wMinus += ranks[k];
  }

  // Normal approximation with continuity correction.
  const mean = (n * (n + 1)) / 4;
  const tieCorrection = tieGroupSizes.reduce((s, t) => s + (t * t * t - t), 0) / 48;
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieCorrection;
  if (variance <= 0) {
    return { n, wPlus, wMinus, z: 0, pValue: 1, alternative };
  }
  const stdev = Math.sqrt(variance);

  // For "less" (specialists < trim, so most differences are negative), wPlus
  // should be SMALL → z is negative. For "greater", wPlus should be LARGE
  // → z is positive. Continuity correction shrinks the |z| toward zero.
  let z: number;
  if (alternative === "less") {
    z = (wPlus - mean + 0.5) / stdev; // upper continuity correction
  } else {
    z = (wPlus - mean - 0.5) / stdev; // lower continuity correction
  }

  const pValue =
    alternative === "less"
      ? standardNormalCdf(z)
      : 1 - standardNormalCdf(z);

  return { n, wPlus, wMinus, z, pValue, alternative };
}

// --------------------------------------------------------------------
// Holm-Bonferroni multiple-comparison adjustment
// --------------------------------------------------------------------

export interface HolmAdjustResult {
  /** Adjusted p-values, in the same order as the input. */
  adjusted: number[];
  /** Booleans, true iff that test rejects H0 at the given alpha. */
  rejects: boolean[];
}

/**
 * Holm-Bonferroni step-down adjustment. More powerful than Bonferroni
 * (rejects more often) while preserving family-wise error control at
 * `alpha`.
 *
 *   1. Sort p-values ascending: p_(1), p_(2), ..., p_(m)
 *   2. Compare p_(i) against alpha/(m-i+1)
 *   3. If p_(1) > alpha/m: reject nothing (early termination).
 *      Otherwise reject H_(1), test H_(2) vs alpha/(m-1), ... etc.
 *   4. Once a hypothesis fails to reject, all subsequent ones (in sorted
 *      order) also fail to reject.
 *
 * Adjusted p-value = min over j≥i of ((m-j+1) × p_(j)), capped at 1, then
 * monotonized so adjusted_(i+1) ≥ adjusted_(i).
 */
export function holmBonferroni(
  pValues: ReadonlyArray<number>,
  alpha: number,
): HolmAdjustResult {
  const m = pValues.length;
  if (m === 0) return { adjusted: [], rejects: [] };

  // Sort p-values ascending, remember original positions.
  const indexed = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);

  // Compute adjusted p-values in sorted order.
  const sortedAdjusted: number[] = new Array(m);
  let runningMax = 0;
  for (let k = 0; k < m; k++) {
    const stepP = (m - k) * indexed[k].p;
    const capped = Math.min(stepP, 1);
    runningMax = Math.max(runningMax, capped);
    sortedAdjusted[k] = runningMax;
  }

  // Map back to input order.
  const adjusted: number[] = new Array(m);
  const rejects: boolean[] = new Array(m).fill(false);
  for (let k = 0; k < m; k++) {
    adjusted[indexed[k].i] = sortedAdjusted[k];
    rejects[indexed[k].i] = sortedAdjusted[k] <= alpha;
  }
  return { adjusted, rejects };
}

// --------------------------------------------------------------------
// Effect size — Hedges' g (small-n-corrected Cohen's d)
// --------------------------------------------------------------------

/**
 * Hedges' g for paired differences. Cohen's d = mean(d) / sd(d); Hedges'
 * g multiplies by J = 1 - 3/(4(n-1) - 1) to correct the small-sample
 * positive bias. For n=13, J ≈ 0.939 — the correction is non-trivial.
 *
 * Returns NaN if n < 2 (sd undefined) or if sd = 0 (no variance, infinite
 * effect size).
 */
export function hedgesG(differences: ReadonlyArray<number>): number {
  const n = differences.length;
  if (n < 2) return Number.NaN;
  const mean = differences.reduce((a, b) => a + b, 0) / n;
  let sumSq = 0;
  for (const d of differences) sumSq += (d - mean) ** 2;
  const sd = Math.sqrt(sumSq / (n - 1));
  if (sd === 0) return Number.NaN;
  const cohensD = mean / sd;
  const j = 1 - 3 / (4 * (n - 1) - 1);
  return cohensD * j;
}

// --------------------------------------------------------------------
// Standard normal CDF (Abramowitz-Stegun 26.2.17 approximation)
// --------------------------------------------------------------------

export function standardNormalCdf(z: number): number {
  // Abramowitz-Stegun rational approximation; |error| < 7.5e-8.
  const sign = z < 0 ? -1 : 1;
  const absZ = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * absZ);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-absZ * absZ);
  return 0.5 * (1 + sign * y);
}

// --------------------------------------------------------------------
// Coefficient of variation (sensitivity stat for K=N replicate variance)
// --------------------------------------------------------------------

/**
 * Coefficient of variation = stdev / |mean|. NaN when mean = 0 or n < 2.
 * Reported per-issue across the K replicates of a specialist arm to
 * surface issues where within-specialist nondeterminism is large enough
 * to matter for the paired test.
 */
export function coefficientOfVariation(values: ReadonlyArray<number>): number {
  const n = values.length;
  if (n < 2) return Number.NaN;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return Number.NaN;
  let sumSq = 0;
  for (const v of values) sumSq += (v - mean) ** 2;
  const sd = Math.sqrt(sumSq / (n - 1));
  return sd / Math.abs(mean);
}

// --------------------------------------------------------------------
// Median + mean helpers (used by the aggregator; colocated for tests)
// --------------------------------------------------------------------

export function median(values: ReadonlyArray<number>): number {
  const n = values.length;
  if (n === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

export function mean(values: ReadonlyArray<number>): number {
  const n = values.length;
  if (n === 0) return Number.NaN;
  return values.reduce((a, b) => a + b, 0) / n;
}
