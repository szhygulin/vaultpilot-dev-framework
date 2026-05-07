// A correct composer must never reward absent signal more than present signal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: empty record utility <= populated record utility", () => {
  const empty = composeUtility({} as any);
  const populated = composeUtility({
    ref: 50,
    refs: 50,
    reinforcement: 50,
    reinforcementCount: 50,
    pushback: 10,
    pushbackCount: 10,
    incidents: 5,
    incidentCount: 5,
    recency: 1.0,
    centrality: 1.0,
    crossRefCentrality: 1.0,
    lastCitedDays: 0,
  } as any);
  assert.ok(Number.isFinite(empty));
  assert.ok(Number.isFinite(populated));
  assert.ok(
    empty <= populated + 1e-9,
    `empty=${empty} populated=${populated}; empty should never exceed populated`,
  );
});
