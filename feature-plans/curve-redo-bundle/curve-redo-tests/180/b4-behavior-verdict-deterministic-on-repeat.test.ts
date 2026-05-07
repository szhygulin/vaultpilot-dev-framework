import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: same inputs produce same output across repeated invocations", () => {
  const section = { id: "s0", bytes: 250 } as any;
  const record = {
    reinforcement: 7, references: 7, ref: 7,
    pushback: 2, pushbacks: 2,
    incidents: 1, pastIncidents: 1,
    recency: 0.5, lastCitedDaysAgo: 14,
    lastCitedAt: new Date().toISOString(),
    centrality: 0.5, crossRef: 0.5,
  } as any;
  const r1 = verdict(section, record, 1.5);
  const r2 = verdict(section, record, 1.5);
  const r3 = verdict(section, record, 1.5);
  assert.equal(r1, r2);
  assert.equal(r2, r3);
});
