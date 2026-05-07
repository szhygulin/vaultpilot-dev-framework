import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: low contextCostFactor with strong utility keeps", () => {
  const section = { id: "s0", bytes: 100 } as any;
  const record = {
    reinforcement: 14, references: 14, ref: 14,
    pushback: 3, pushbacks: 3,
    incidents: 3, pastIncidents: 3,
    recency: 1.0, lastCitedDaysAgo: 1,
    lastCitedAt: new Date().toISOString(),
    centrality: 1.0, crossRef: 1.0,
  } as any;
  assert.equal(verdict(section, record, 0.1), "keep");
});
