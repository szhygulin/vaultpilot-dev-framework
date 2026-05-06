import type { CurveSample, QualityScore } from "./types.js";
import { fitPolynomialRegression, type PolynomialRegression } from "./regression.js";

/**
 * Convert a per-agent quality score to a degradation factor anchored at 1.0
 * (the highest-quality agent gets factor=1; others scale up). Caller should
 * filter agents with non-positive quality before passing here.
 */
export function qualityToFactor(quality: number, qualityMax: number): number {
  if (qualityMax <= 0) return 1;
  if (quality <= 0) return Number.POSITIVE_INFINITY;
  return qualityMax / quality;
}

/**
 * Project per-agent quality scores into curve samples. Each agent contributes
 * one sample (sizeBytes → factor). Ordered by sizeBytes ascending.
 */
export function samplesFromScores(scores: ReadonlyArray<QualityScore>): CurveSample[] {
  if (scores.length === 0) return [];
  const sorted = [...scores].sort((a, b) => a.agentSizeBytes - b.agentSizeBytes);
  const qmax = Math.max(...sorted.map((s) => s.quality));
  return sorted.map((s) => ({
    xBytes: s.agentSizeBytes,
    factor: Math.max(1, qualityToFactor(s.quality, qmax)),
  }));
}

/**
 * Merge two sample sets, with policy for collisions on identical xBytes.
 *   - "replace-on-collision" (default): newer sample wins
 *   - "average-on-collision": (factor_old + factor_new) / 2
 *   - "keep-both": both retained (rare; produces duplicate x and a degenerate
 *     fit unless degree is high enough to interpolate)
 *
 * Output is sorted by xBytes ascending. Used by `--mode update`.
 */
export function mergeSamples(
  base: ReadonlyArray<CurveSample>,
  fresh: ReadonlyArray<CurveSample>,
  policy: "replace-on-collision" | "average-on-collision" | "keep-both" = "replace-on-collision",
): CurveSample[] {
  if (policy === "keep-both") {
    return [...base, ...fresh].sort((a, b) => a.xBytes - b.xBytes);
  }
  const byX = new Map<number, number>();
  for (const s of base) byX.set(s.xBytes, s.factor);
  for (const s of fresh) {
    const prior = byX.get(s.xBytes);
    if (prior == null) {
      byX.set(s.xBytes, s.factor);
    } else if (policy === "average-on-collision") {
      byX.set(s.xBytes, (prior + s.factor) / 2);
    } else {
      byX.set(s.xBytes, s.factor); // replace-on-collision: newer wins
    }
  }
  return [...byX.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([xBytes, factor]) => ({ xBytes, factor }));
}

/** Convenience: fit a regression directly from per-agent quality scores. */
export function fitFromQualityScores(
  scores: ReadonlyArray<QualityScore>,
  degree: number = 2,
): { samples: CurveSample[]; regression: PolynomialRegression } {
  const samples = samplesFromScores(scores);
  const regression = fitPolynomialRegression(samples, degree);
  return { samples, regression };
}
