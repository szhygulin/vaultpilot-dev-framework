import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cellKeyFor,
  loadCellScores,
  qualityFromAB,
  samplesFromCellScores,
  type CellJudgeScore,
  type CellTestScore,
} from "./cellScores.js";
import type { Cell } from "./types.js";

function judge(median: number, isError = false): CellJudgeScore {
  return { median, scores: [median], variance: 0, isError };
}
function tests(passed: number, total = 100, applyCleanly = true): CellTestScore {
  return { passed, failed: total - passed, errored: 0, total, applyCleanly, runtimeMs: 1000 };
}
function cell(agentId: string, sizeBytes: number, issueId: number, decision: Cell["decision"]): Cell {
  return {
    agentId,
    agentSizeBytes: sizeBytes,
    issueId,
    decision,
    reason: null,
    costUsd: 0,
    durationMs: 0,
    isError: decision === "error",
    errorReason: null,
    log: "",
  };
}

test("cellKeyFor: format without replicate", () => {
  assert.equal(cellKeyFor("agent-916a", 190), "agent-916a-190");
});

test("cellKeyFor: format with replicate", () => {
  assert.equal(cellKeyFor("agent-916a", 190, 2), "agent-916a-190-r2");
});

test("qualityFromAB: implement = A + B at the maximum", () => {
  const q = qualityFromAB({ decision: "implement", judge: judge(85), test: tests(72) });
  assert.equal(q, 85 + 72);
});

test("qualityFromAB: implement caps at 200 with A=100, B=100", () => {
  const q = qualityFromAB({ decision: "implement", judge: judge(100), test: tests(100) });
  assert.equal(q, 200);
});

test("qualityFromAB: implement = 0 when test apply failed", () => {
  const q = qualityFromAB({
    decision: "implement",
    judge: judge(85),
    test: tests(50, 100, false),
  });
  assert.equal(q, 0);
});

test("qualityFromAB: implement = 0 when judge errored even if tests passed", () => {
  const q = qualityFromAB({
    decision: "implement",
    judge: judge(0, true),
    test: tests(50),
  });
  assert.equal(q, 0);
});

test("qualityFromAB: implement = 0 when test data is missing", () => {
  const q = qualityFromAB({ decision: "implement", judge: judge(85) });
  assert.equal(q, 0);
});

test("qualityFromAB: implement = 0 when judge data is missing", () => {
  const q = qualityFromAB({ decision: "implement", test: tests(50) });
  assert.equal(q, 0);
});

test("qualityFromAB: implement = 0 when test errorReason is set", () => {
  const q = qualityFromAB({
    decision: "implement",
    judge: judge(85),
    test: { ...tests(50), errorReason: "test-runner timed out" },
  });
  assert.equal(q, 0);
});

test("qualityFromAB: pushback = 2 × A regardless of test outcome", () => {
  const q = qualityFromAB({
    decision: "pushback",
    judge: judge(75),
    test: tests(0), // tests irrelevant for pushback
  });
  assert.equal(q, 150);
});

test("qualityFromAB: pushback = 0 when judge errored", () => {
  const q = qualityFromAB({ decision: "pushback", judge: judge(0, true) });
  assert.equal(q, 0);
});

test("qualityFromAB: error decision = 0 even with judge + tests", () => {
  const q = qualityFromAB({
    decision: "error",
    judge: judge(85),
    test: tests(80),
  });
  assert.equal(q, 0);
});

test("qualityFromAB: error_max_turns decision = 0", () => {
  const q = qualityFromAB({
    decision: "error_max_turns",
    judge: judge(85),
    test: tests(80),
  });
  assert.equal(q, 0);
});

test("qualityFromAB: null decision = 0", () => {
  const q = qualityFromAB({ decision: null });
  assert.equal(q, 0);
});

test("qualityFromAB: implement with non-100 total normalizes B to 0-100", () => {
  // 12/40 passed → B should be 30, not 12
  const q = qualityFromAB({
    decision: "implement",
    judge: judge(50),
    test: tests(12, 40),
  });
  assert.equal(q, 50 + 30);
});

test("qualityFromAB: implement with total=0 returns 0 (avoid div by zero)", () => {
  const q = qualityFromAB({
    decision: "implement",
    judge: judge(50),
    test: { passed: 0, failed: 0, errored: 0, total: 0, applyCleanly: true, runtimeMs: 0 },
  });
  assert.equal(q, 0);
});

test("qualityFromAB: out-of-range judge median is clamped", () => {
  // Schema in reasoningJudge.ts already enforces 0-100, but the loader
  // accepts arbitrary JSON; clamp defensively.
  const q = qualityFromAB({
    decision: "implement",
    judge: judge(150),
    test: tests(50),
  });
  assert.equal(q, 100 + 50); // A clamped to 100
});

test("loadCellScores: returns empty map when scoresDir doesn't exist", async () => {
  const out = await loadCellScores(path.join(os.tmpdir(), "definitely-not-a-real-dir-" + Date.now()));
  assert.equal(out.size, 0);
});

test("loadCellScores: pairs <cellKey>-tests.json + <cellKey>-judge.json into one entry", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cell-scores-test-"));
  try {
    await fs.writeFile(
      path.join(dir, "agent-x-100-tests.json"),
      JSON.stringify(tests(80)),
    );
    await fs.writeFile(
      path.join(dir, "agent-x-100-judge.json"),
      JSON.stringify(judge(75)),
    );
    await fs.writeFile(
      path.join(dir, "unrelated.txt"),
      "irrelevant",
    );
    const out = await loadCellScores(dir);
    assert.equal(out.size, 1);
    const e = out.get("agent-x-100");
    assert.ok(e);
    assert.equal(e!.test?.passed, 80);
    assert.equal(e!.judge?.median, 75);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("loadCellScores: malformed JSON leaves the entry's slot undefined", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cell-scores-test-"));
  try {
    await fs.writeFile(path.join(dir, "agent-y-200-tests.json"), "not json");
    await fs.writeFile(
      path.join(dir, "agent-y-200-judge.json"),
      JSON.stringify(judge(60)),
    );
    const out = await loadCellScores(dir);
    const e = out.get("agent-y-200");
    assert.ok(e);
    assert.equal(e!.test, undefined);
    assert.equal(e!.judge?.median, 60);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("samplesFromCellScores: per-agent mean + factor anchored at qmax=1.0", () => {
  const cells: Cell[] = [
    cell("agent-small", 6000, 100, "implement"),
    cell("agent-small", 6000, 200, "implement"),
    cell("agent-large", 50000, 100, "implement"),
    cell("agent-large", 50000, 200, "implement"),
  ];
  const scores = new Map([
    ["agent-small-100", { cellKey: "agent-small-100", judge: judge(80), test: tests(80) }],
    ["agent-small-200", { cellKey: "agent-small-200", judge: judge(80), test: tests(80) }],
    ["agent-large-100", { cellKey: "agent-large-100", judge: judge(50), test: tests(50) }],
    ["agent-large-200", { cellKey: "agent-large-200", judge: judge(50), test: tests(50) }],
  ]);
  const samples = samplesFromCellScores(cells, scores);
  assert.equal(samples.length, 2);
  assert.deepEqual(
    samples.map((s) => s.xBytes),
    [6000, 50000],
  );
  // small agent: mean quality 160 (qmax)
  assert.equal(samples[0].factor, 1);
  // large agent: mean quality 100 → factor = 160/100 = 1.6
  assert.ok(Math.abs(samples[1].factor - 1.6) < 1e-9, `expected ~1.6, got ${samples[1].factor}`);
});

test("samplesFromCellScores: cells with no matching score entry contribute 0 quality", () => {
  const cells: Cell[] = [
    cell("agent-x", 6000, 100, "implement"),
    cell("agent-x", 6000, 200, "implement"), // no score entry
    cell("agent-y", 50000, 100, "implement"),
  ];
  const scores = new Map([
    ["agent-x-100", { cellKey: "agent-x-100", judge: judge(100), test: tests(100) }],
    ["agent-y-100", { cellKey: "agent-y-100", judge: judge(80), test: tests(80) }],
  ]);
  const samples = samplesFromCellScores(cells, scores);
  // agent-x mean = (200 + 0) / 2 = 100; agent-y mean = 160; qmax = 160
  // agent-x factor = 160/100 = 1.6; agent-y factor = 1.0
  assert.equal(samples.length, 2);
  assert.equal(samples[1].factor, 1); // agent-y is qmax
  assert.ok(Math.abs(samples[0].factor - 1.6) < 1e-9);
});

test("samplesFromCellScores: pushback cells use 2A scoring", () => {
  const cells: Cell[] = [
    cell("agent-p", 6000, 100, "pushback"),
    cell("agent-p", 6000, 200, "pushback"),
  ];
  const scores = new Map([
    ["agent-p-100", { cellKey: "agent-p-100", judge: judge(80) }],
    ["agent-p-200", { cellKey: "agent-p-200", judge: judge(60) }],
  ]);
  const samples = samplesFromCellScores(cells, scores);
  assert.equal(samples.length, 1);
  // mean = (160 + 120) / 2 = 140; only agent so factor=1
  assert.equal(samples[0].factor, 1);
});

test("samplesFromCellScores: all-zero quality returns factor=1 for every agent (degenerate but fittable)", () => {
  const cells: Cell[] = [
    cell("agent-a", 6000, 100, "error"),
    cell("agent-b", 50000, 100, "error"),
  ];
  const samples = samplesFromCellScores(cells, new Map());
  assert.equal(samples.length, 2);
  assert.deepEqual(samples.map((s) => s.factor), [1, 1]);
});

test("samplesFromCellScores: empty input returns empty array", () => {
  const samples = samplesFromCellScores([], new Map());
  assert.equal(samples.length, 0);
});

test("samplesFromCellScores: agents are sorted by sizeBytes ascending", () => {
  const cells: Cell[] = [
    cell("agent-c", 35000, 100, "implement"),
    cell("agent-a", 6000, 100, "implement"),
    cell("agent-b", 14000, 100, "implement"),
  ];
  const scores = new Map([
    ["agent-c-100", { cellKey: "agent-c-100", judge: judge(80), test: tests(80) }],
    ["agent-a-100", { cellKey: "agent-a-100", judge: judge(50), test: tests(50) }],
    ["agent-b-100", { cellKey: "agent-b-100", judge: judge(60), test: tests(60) }],
  ]);
  const samples = samplesFromCellScores(cells, scores);
  assert.deepEqual(samples.map((s) => s.xBytes), [6000, 14000, 35000]);
});
