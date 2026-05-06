import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPiecewiseQuadratic,
  evaluateCurve,
  fitFromQualityScores,
  lagrangeQuadratic,
  qualityToFactor,
} from "./fit.js";
import type { CurveBreakpoint, QualityScore } from "./types.js";

const eps = 1e-9;

test("lagrangeQuadratic: three colinear points yield a=0", () => {
  const { a, b, c } = lagrangeQuadratic([0, 0], [1, 1], [2, 2]);
  assert.ok(Math.abs(a) < eps, `a should be 0, got ${a}`);
  assert.ok(Math.abs(b - 1) < eps, `b should be 1, got ${b}`);
  assert.ok(Math.abs(c) < eps, `c should be 0, got ${c}`);
});

test("lagrangeQuadratic: y = x^2 reproduces a=1,b=0,c=0", () => {
  const { a, b, c } = lagrangeQuadratic([1, 1], [2, 4], [3, 9]);
  assert.ok(Math.abs(a - 1) < eps, `a=${a}`);
  assert.ok(Math.abs(b) < eps, `b=${b}`);
  assert.ok(Math.abs(c) < eps, `c=${c}`);
});

test("lagrangeQuadratic: passes through all three input points", () => {
  const p0: [number, number] = [0, 1];
  const p1: [number, number] = [10, 1.5];
  const p2: [number, number] = [25, 4.0];
  const { a, b, c } = lagrangeQuadratic(p0, p1, p2);
  for (const [x, y] of [p0, p1, p2]) {
    const yhat = a * x * x + b * x + c;
    assert.ok(Math.abs(yhat - y) < 1e-6, `(${x}, ${y}) -> ${yhat}`);
  }
});

test("lagrangeQuadratic: throws on duplicate x", () => {
  assert.throws(() => lagrangeQuadratic([1, 1], [1, 2], [3, 9]));
});

test("buildPiecewiseQuadratic: passes through every breakpoint", () => {
  const bps: CurveBreakpoint[] = [
    { xBytes: 8192, factor: 1.0 },
    { xBytes: 16384, factor: 1.2 },
    { xBytes: 32768, factor: 2.5 },
    { xBytes: 49152, factor: 4.0 },
    { xBytes: 65536, factor: 6.0 },
  ];
  const curve = buildPiecewiseQuadratic(bps);
  for (const bp of bps) {
    const y = evaluateCurve(curve, bp.xBytes);
    assert.ok(
      Math.abs(y - bp.factor) < 1e-6,
      `at ${bp.xBytes}: got ${y}, expected ${bp.factor}`,
    );
  }
});

test("buildPiecewiseQuadratic: <3 points throws", () => {
  assert.throws(() => buildPiecewiseQuadratic([{ xBytes: 1, factor: 1 }]));
  assert.throws(() =>
    buildPiecewiseQuadratic([
      { xBytes: 1, factor: 1 },
      { xBytes: 2, factor: 2 },
    ]),
  );
});

test("evaluateCurve: clamps below the first breakpoint to its factor", () => {
  const curve = buildPiecewiseQuadratic([
    { xBytes: 100, factor: 1.0 },
    { xBytes: 200, factor: 2.0 },
    { xBytes: 300, factor: 3.0 },
  ]);
  assert.equal(evaluateCurve(curve, 50), 1.0);
  assert.equal(evaluateCurve(curve, 0), 1.0);
});

test("evaluateCurve: clampHigh holds the last factor above the last breakpoint", () => {
  const curve = buildPiecewiseQuadratic([
    { xBytes: 100, factor: 1.0 },
    { xBytes: 200, factor: 2.0 },
    { xBytes: 300, factor: 3.0 },
  ]);
  assert.equal(evaluateCurve(curve, 1000, { clampHigh: true }), 3.0);
});

test("evaluateCurve: extrapolates without clampHigh", () => {
  const curve = buildPiecewiseQuadratic([
    { xBytes: 0, factor: 0 },
    { xBytes: 10, factor: 100 },
    { xBytes: 20, factor: 400 },
  ]);
  // y = x^2, evaluate at x=30 → 900
  const y = evaluateCurve(curve, 30);
  assert.ok(Math.abs(y - 900) < 1e-6, `extrapolated y=${y}`);
});

test("evaluateCurve: returns NaN-free for inputs in range", () => {
  const curve = buildPiecewiseQuadratic([
    { xBytes: 8192, factor: 1.0 },
    { xBytes: 16384, factor: 1.2 },
    { xBytes: 32768, factor: 2.5 },
    { xBytes: 49152, factor: 4.0 },
    { xBytes: 65536, factor: 6.0 },
  ]);
  for (let x = 8192; x <= 65536; x += 1024) {
    const y = evaluateCurve(curve, x);
    assert.ok(!Number.isNaN(y) && Number.isFinite(y), `NaN/inf at x=${x}`);
  }
});

test("qualityToFactor: factor = qualityMax/quality, anchors at 1.0 for the best agent", () => {
  assert.equal(qualityToFactor(1.0, 1.0), 1.0);
  assert.equal(qualityToFactor(0.5, 1.0), 2.0);
  assert.equal(qualityToFactor(0.25, 1.0), 4.0);
});

test("qualityToFactor: zero quality maps to +Infinity", () => {
  assert.equal(qualityToFactor(0, 1.0), Number.POSITIVE_INFINITY);
});

test("fitFromQualityScores: produces a curve anchored at factor=1 for the best agent", () => {
  const scores: QualityScore[] = [
    { agentId: "a", agentSizeBytes: 6000, cellCount: 3, implementRate: 0.7, pushbackAccuracyRate: 1, errorMaxTurnsRate: 0, prCorrectnessRate: 1, quality: 0.95 },
    { agentId: "b", agentSizeBytes: 18000, cellCount: 3, implementRate: 0.7, pushbackAccuracyRate: 1, errorMaxTurnsRate: 0, prCorrectnessRate: 1, quality: 0.90 },
    { agentId: "c", agentSizeBytes: 42000, cellCount: 3, implementRate: 0.6, pushbackAccuracyRate: 1, errorMaxTurnsRate: 0.1, prCorrectnessRate: 0.9, quality: 0.75 },
  ];
  const curve = fitFromQualityScores(scores);
  assert.equal(curve.breakpoints.length, 3);
  assert.equal(curve.breakpoints[0].factor, 1.0);
  assert.ok(curve.breakpoints[2].factor > curve.breakpoints[0].factor);
});
