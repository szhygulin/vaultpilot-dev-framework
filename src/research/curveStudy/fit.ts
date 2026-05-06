import type { CurveBreakpoint, QualityScore } from "./types.js";

/**
 * Fit a piecewise quadratic over (sizeBytes, accuracyDegradationFactor) points.
 * Inputs come from QualityScore[]; we invert quality → factor as
 *   factor = quality_max / quality(s).
 * factor ≥ 1 by construction, anchored to 1.0 at the smallest studied size if
 * that size has the highest quality (the expected shape — small CLAUDE.md
 * least confused).
 *
 * Curve shape: 3-point Lagrange windows. For each segment [x_i, x_{i+1}], the
 * quadratic passes through {x_{i-1}, x_i, x_{i+1}} (interior) or three
 * boundary points at the ends. evaluate() picks the segment containing x and
 * applies its quadratic. With <3 input points, evaluate falls back to linear.
 */
export interface PiecewiseQuadraticCurve {
  /** Knot points the operator commits to source as `CONTEXT_COST_BREAKPOINTS`. */
  breakpoints: CurveBreakpoint[];
  /** Per-segment quadratic coefficients, segment i covers x ∈ [breakpoints[i].xBytes, breakpoints[i+1].xBytes]. */
  segments: ReadonlyArray<{ a: number; b: number; c: number; xLo: number; xHi: number }>;
}

/**
 * Compute factor = qualityMax / quality. Anchors at 1.0 (best-quality point).
 * Caller decides what to do with NaN inputs (we treat zero-quality as a guard).
 */
export function qualityToFactor(quality: number, qualityMax: number): number {
  if (qualityMax <= 0) return 1;
  if (quality <= 0) return Number.POSITIVE_INFINITY;
  return qualityMax / quality;
}

/**
 * Fit a 3-point Lagrange quadratic through (x0,y0), (x1,y1), (x2,y2). Returns
 * coefficients (a, b, c) such that y = a*x² + b*x + c.
 */
export function lagrangeQuadratic(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
): { a: number; b: number; c: number } {
  const [x0, y0] = p0;
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const d01 = (x0 - x1) * (x0 - x2);
  const d10 = (x1 - x0) * (x1 - x2);
  const d20 = (x2 - x0) * (x2 - x1);
  if (d01 === 0 || d10 === 0 || d20 === 0) {
    throw new Error("lagrangeQuadratic: duplicate x in fit window");
  }
  const c0 = y0 / d01;
  const c1 = y1 / d10;
  const c2 = y2 / d20;
  // y = c0*(x-x1)*(x-x2) + c1*(x-x0)*(x-x2) + c2*(x-x0)*(x-x1)
  // expand to a*x² + b*x + c
  const a = c0 + c1 + c2;
  const b =
    -c0 * (x1 + x2) -
    c1 * (x0 + x2) -
    c2 * (x0 + x1);
  const c =
    c0 * x1 * x2 +
    c1 * x0 * x2 +
    c2 * x0 * x1;
  return { a, b, c };
}

/**
 * Build the piecewise-quadratic curve from sorted (xBytes, factor) breakpoints.
 * Each segment uses a 3-point Lagrange window centered around the segment.
 *   - First segment: window = points [0, 1, 2]
 *   - Last segment:  window = points [n-3, n-2, n-1]
 *   - Interior i:    window = points [i-1, i, i+1]   (for segment between i and i+1, we choose [i-1, i, i+1] for left bias; alternative would be [i, i+1, i+2])
 * Picking a left-biased window keeps continuity at x_i where consecutive
 * segments share a point. Right at x_{i+1} the transition jumps to the next
 * segment's window — discontinuity is bounded by the data spread, and stays
 * small for monotonic curves.
 *
 * Requires ≥3 breakpoints; throws otherwise (caller should fall back to a
 * linear interpolant for sparser data).
 */
export function buildPiecewiseQuadratic(
  breakpoints: CurveBreakpoint[],
): PiecewiseQuadraticCurve {
  if (breakpoints.length < 3) {
    throw new Error(`buildPiecewiseQuadratic: need >=3 points, got ${breakpoints.length}`);
  }
  const sorted = [...breakpoints].sort((a, b) => a.xBytes - b.xBytes);
  const n = sorted.length;
  const segments: PiecewiseQuadraticCurve["segments"] = [];
  for (let i = 0; i < n - 1; i++) {
    let i0: number, i1: number, i2: number;
    if (i === 0) {
      [i0, i1, i2] = [0, 1, 2];
    } else if (i === n - 2) {
      [i0, i1, i2] = [n - 3, n - 2, n - 1];
    } else {
      [i0, i1, i2] = [i - 1, i, i + 1];
    }
    const p0: [number, number] = [sorted[i0].xBytes, sorted[i0].factor];
    const p1: [number, number] = [sorted[i1].xBytes, sorted[i1].factor];
    const p2: [number, number] = [sorted[i2].xBytes, sorted[i2].factor];
    const { a, b, c } = lagrangeQuadratic(p0, p1, p2);
    (segments as { a: number; b: number; c: number; xLo: number; xHi: number }[]).push({
      a,
      b,
      c,
      xLo: sorted[i].xBytes,
      xHi: sorted[i + 1].xBytes,
    });
  }
  return { breakpoints: sorted, segments };
}

/**
 * Evaluate the curve at `xBytes`. Clamps below the first breakpoint to its
 * factor, and above the last breakpoint extrapolates the final segment's
 * quadratic (caller may want to clamp instead — surface the choice via the
 * `clampHigh` option).
 */
export function evaluateCurve(
  curve: PiecewiseQuadraticCurve,
  xBytes: number,
  opts?: { clampHigh?: boolean },
): number {
  const { breakpoints, segments } = curve;
  if (xBytes <= breakpoints[0].xBytes) return breakpoints[0].factor;
  if (xBytes >= breakpoints[breakpoints.length - 1].xBytes) {
    if (opts?.clampHigh) return breakpoints[breakpoints.length - 1].factor;
    const last = segments[segments.length - 1];
    return last.a * xBytes * xBytes + last.b * xBytes + last.c;
  }
  for (const seg of segments) {
    if (xBytes >= seg.xLo && xBytes <= seg.xHi) {
      return seg.a * xBytes * xBytes + seg.b * xBytes + seg.c;
    }
  }
  throw new Error(`evaluateCurve: ${xBytes} fell through segments`);
}

/**
 * Convenience: produce breakpoints from per-agent quality scores. Orders by
 * size, normalizes factor=qualityMax/quality, and floors factor to 1.0
 * (smallest size becomes the anchor).
 */
export function fitFromQualityScores(scores: QualityScore[]): PiecewiseQuadraticCurve {
  if (scores.length < 3) {
    throw new Error(`fitFromQualityScores: need >=3 scores, got ${scores.length}`);
  }
  const sorted = [...scores].sort((a, b) => a.agentSizeBytes - b.agentSizeBytes);
  const qmax = Math.max(...sorted.map((s) => s.quality));
  const breakpoints: CurveBreakpoint[] = sorted.map((s) => ({
    xBytes: s.agentSizeBytes,
    factor: Math.max(1, qualityToFactor(s.quality, qmax)),
  }));
  return buildPiecewiseQuadratic(breakpoints);
}
