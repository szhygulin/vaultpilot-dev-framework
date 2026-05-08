import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

function rank(v: string): number {
  return v === "keep" ? 2 : v === "trim" ? 1 : v === "drop" ? 0 : -1;
}

test("verdict: keepness(low-cost) >= keepness(high-cost) for the same record", () => {
  const section = { id: "s0", bytes: 100 } as any;
  const record = {
    reinforcement: 5, references: 5, ref: 5,
    pushback: 1, pushbacks: 1,
    incidents: 1, pastIncidents: 1,
    recency: 1.0, lastCitedDaysAgo: 2,
    lastCitedAt: new Date().toISOString(),
    centrality: 0.5, crossRef: 0.5,
  } as any;
  const lo = verdict(section, record, 0.5);
  const hi = verdict(section, record, 50);
  assert.ok(rank(lo) >= rank(hi), `monotone violation: low=${lo} hi=${hi}`);
});
