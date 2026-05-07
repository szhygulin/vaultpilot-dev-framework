import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: pushback + references + incidents combination keeps", () => {
  const section = { id: "s1", bytes: 20 } as any;
  const record = {
    reinforcement: 9, references: 9, ref: 9,
    pushback: 3, pushbacks: 3,
    incidents: 2, pastIncidents: 2,
    recency: 1.0, lastCitedDaysAgo: 1,
    lastCitedAt: new Date().toISOString(),
    centrality: 0.6, crossRef: 0.6,
  } as any;
  assert.equal(verdict(section, record, 1.0), "keep");
});
