import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreAgent, scoreAllAgents } from "./score.js";
import type { Cell, RubricScore } from "./types.js";

function cell(partial: Partial<Cell>): Cell {
  return {
    agentId: "agent-9180",
    agentSizeBytes: 6000,
    issueId: 50,
    decision: null,
    reason: null,
    costUsd: 0,
    durationMs: 0,
    isError: false,
    errorReason: null,
    log: "x.log",
    ...partial,
  };
}

test("scoreAgent: all-implement, default rubric, quality = 0.4 + 0.2 + 0.15 = 0.75", () => {
  const cells = [
    cell({ issueId: 1, decision: "implement" }),
    cell({ issueId: 2, decision: "implement" }),
    cell({ issueId: 3, decision: "implement" }),
  ];
  const s = scoreAgent(cells);
  assert.equal(s.implementRate, 1);
  assert.equal(s.prCorrectnessRate, 1);
  assert.equal(s.errorMaxTurnsRate, 0);
  // pushbackAccuracyRate = 0 (no pushback cells, contributes 0.25*0=0)
  assert.equal(s.pushbackAccuracyRate, 0);
  assert.ok(Math.abs(s.quality - 0.75) < 1e-9, `quality=${s.quality}`);
});

test("scoreAgent: all-pushback with accurate rubric, quality = 0.25 + 0.2 = 0.45", () => {
  const cells = [
    cell({ issueId: 1, decision: "pushback" }),
    cell({ issueId: 2, decision: "pushback" }),
  ];
  const rubrics: RubricScore[] = [
    { agentId: "agent-9180", issueId: 1, pushbackAccuracy: 1 },
    { agentId: "agent-9180", issueId: 2, pushbackAccuracy: 1 },
  ];
  const s = scoreAgent(cells, rubrics);
  assert.equal(s.pushbackAccuracyRate, 1);
  assert.equal(s.implementRate, 0);
  assert.ok(Math.abs(s.quality - 0.45) < 1e-9, `quality=${s.quality}`);
});

test("scoreAgent: error_max_turns drags quality via 0.2*(1-rate)", () => {
  const cells = [
    cell({ issueId: 1, decision: "implement" }),
    cell({ issueId: 2, decision: "error_max_turns" }),
  ];
  const s = scoreAgent(cells);
  // implementRate=0.5, errorMaxTurnsRate=0.5, prCorrectness=1 (1/1)
  // pushbackAccuracyRate=0
  // quality = 0.4*0.5 + 0.25*0 + 0.2*(1-0.5) + 0.15*1 = 0.2 + 0 + 0.1 + 0.15 = 0.45
  assert.ok(Math.abs(s.quality - 0.45) < 1e-9, `quality=${s.quality}`);
});

test("scoreAgent: rubric overrides default 'right answer' accuracy", () => {
  const cells = [cell({ issueId: 1, decision: "pushback" })];
  const accurate = scoreAgent(cells, [
    { agentId: "agent-9180", issueId: 1, pushbackAccuracy: 1 },
  ]);
  const inaccurate = scoreAgent(cells, [
    { agentId: "agent-9180", issueId: 1, pushbackAccuracy: 0 },
  ]);
  assert.ok(accurate.quality > inaccurate.quality);
  assert.equal(inaccurate.pushbackAccuracyRate, 0);
});

test("scoreAgent: rejects mixed agentIds", () => {
  assert.throws(() =>
    scoreAgent([
      cell({ agentId: "a" }),
      cell({ agentId: "b" }),
    ]),
  );
});

test("scoreAllAgents: groups by agent and sorts by size ascending", () => {
  const cells = [
    cell({ agentId: "agent-9189", agentSizeBytes: 58000, decision: "pushback" }),
    cell({ agentId: "agent-9180", agentSizeBytes: 6000, decision: "implement" }),
    cell({ agentId: "agent-9185", agentSizeBytes: 28000, decision: "implement" }),
  ];
  const scores = scoreAllAgents(cells);
  assert.equal(scores.length, 3);
  assert.deepEqual(
    scores.map((s) => s.agentSizeBytes),
    [6000, 28000, 58000],
  );
});
