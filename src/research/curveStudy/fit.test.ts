import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSamples, qualityToFactor, samplesFromScores } from "./fit.js";
import type { CurveSample, QualityScore } from "./types.js";

test("qualityToFactor: factor = qualityMax/quality, anchors at 1.0 for the best agent", () => {
  assert.equal(qualityToFactor(1.0, 1.0), 1.0);
  assert.equal(qualityToFactor(0.5, 1.0), 2.0);
  assert.equal(qualityToFactor(0.25, 1.0), 4.0);
});

test("qualityToFactor: zero quality maps to +Infinity", () => {
  assert.equal(qualityToFactor(0, 1.0), Number.POSITIVE_INFINITY);
});

test("samplesFromScores: produces samples sorted by sizeBytes, anchored at factor=1", () => {
  const scores: QualityScore[] = [
    { agentId: "c", agentSizeBytes: 42000, cellCount: 3, implementRate: 0.6, pushbackAccuracyRate: 1, errorMaxTurnsRate: 0.1, prCorrectnessRate: 0.9, quality: 0.75 },
    { agentId: "a", agentSizeBytes: 6000,  cellCount: 3, implementRate: 0.7, pushbackAccuracyRate: 1, errorMaxTurnsRate: 0,   prCorrectnessRate: 1,   quality: 0.95 },
    { agentId: "b", agentSizeBytes: 18000, cellCount: 3, implementRate: 0.7, pushbackAccuracyRate: 1, errorMaxTurnsRate: 0,   prCorrectnessRate: 1,   quality: 0.90 },
  ];
  const samples = samplesFromScores(scores);
  assert.deepEqual(samples.map((s) => s.xBytes), [6000, 18000, 42000]);
  assert.equal(samples[0].factor, 1.0);
  assert.ok(samples[2].factor > samples[0].factor);
});

test("mergeSamples: replace-on-collision keeps newer factor at the same xBytes", () => {
  const base: CurveSample[] = [
    { xBytes: 1000, factor: 1.0 },
    { xBytes: 2000, factor: 1.5 },
  ];
  const fresh: CurveSample[] = [{ xBytes: 2000, factor: 2.0 }];
  const merged = mergeSamples(base, fresh, "replace-on-collision");
  assert.deepEqual(merged, [
    { xBytes: 1000, factor: 1.0 },
    { xBytes: 2000, factor: 2.0 },
  ]);
});

test("mergeSamples: average-on-collision splits the difference", () => {
  const base: CurveSample[] = [{ xBytes: 100, factor: 1.0 }];
  const fresh: CurveSample[] = [{ xBytes: 100, factor: 2.0 }];
  const merged = mergeSamples(base, fresh, "average-on-collision");
  assert.deepEqual(merged, [{ xBytes: 100, factor: 1.5 }]);
});

test("mergeSamples: keep-both retains duplicates", () => {
  const merged = mergeSamples(
    [{ xBytes: 100, factor: 1.0 }],
    [{ xBytes: 100, factor: 2.0 }],
    "keep-both",
  );
  assert.equal(merged.length, 2);
});

test("mergeSamples: union of disjoint sets is sorted by xBytes", () => {
  const base: CurveSample[] = [
    { xBytes: 30000, factor: 2.0 },
    { xBytes: 10000, factor: 1.2 },
  ];
  const fresh: CurveSample[] = [
    { xBytes: 50000, factor: 3.0 },
    { xBytes: 20000, factor: 1.6 },
  ];
  const merged = mergeSamples(base, fresh);
  assert.deepEqual(merged.map((s) => s.xBytes), [10000, 20000, 30000, 50000]);
});
