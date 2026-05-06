import {
  buildPiecewiseQuadratic,
  evaluateCurve,
  type PiecewiseQuadraticCurve,
} from "../research/curveStudy/fit.js";
import type { CurveBreakpoint } from "../research/curveStudy/types.js";

/**
 * Fitted accuracy-degradation-factor breakpoints. `vp-dev research curve-study`
 * emits a JSON proposal; the operator hand-merges the breakpoints here.
 *
 * Provenance: the table below was seeded from #179's pilot data on
 * 2026-05-06 (claude-opus-4-7[1m], advisory-scope-boundary specialty).
 * Re-fit when the orchestrator's primary model tier changes or when
 * studying a different specialty class.
 *
 * Pre-study placeholder values from #177's body — replaced as the curve is
 * recalibrated. Phase 3 consumers should read via {@link contextCostFactor},
 * never index this array directly.
 */
export const CONTEXT_COST_BREAKPOINTS: ReadonlyArray<CurveBreakpoint> = [
  { xBytes: 8192, factor: 1.0 },
  { xBytes: 16384, factor: 1.2 },
  { xBytes: 32768, factor: 2.5 },
  { xBytes: 49152, factor: 4.0 },
  { xBytes: 65536, factor: 6.0 },
];

let cachedCurve: PiecewiseQuadraticCurve | null = null;
function getCurve(): PiecewiseQuadraticCurve {
  if (!cachedCurve) {
    cachedCurve = buildPiecewiseQuadratic([...CONTEXT_COST_BREAKPOINTS]);
  }
  return cachedCurve;
}

/** Test-only: drop the cache so a remap of breakpoints picks up. */
export function resetContextCostCurveCache(): void {
  cachedCurve = null;
}

/**
 * Phase 3's per-section cost function multiplier:
 *   contextCost(section) = bytes × accuracyDegradationFactor(currentTotalBytes)
 *
 * Returns ≥ 1 by construction (clamped). Below the smallest breakpoint
 * returns the smallest factor; above the largest, extrapolates the last
 * segment's quadratic. Callers that prefer a hard cap can pass `clampHigh`.
 */
export function contextCostFactor(
  totalBytes: number,
  opts?: { clampHigh?: boolean },
): number {
  const f = evaluateCurve(getCurve(), totalBytes, opts);
  return Math.max(1, f);
}
