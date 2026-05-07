import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

function rank(v: string): number {
  return v === "keep" ? 2 : v === "trim" ? 1 : v === "drop" ? 0 : -1;
}

test("verdict: keepness(strong) >= keepness(empty) on identical section/cost", () => {
  const section = { id: "s0", bytes: 200 } as any;
  const strong = {
    reinforcement: 14, references: 14, ref: 14,
    pushback: 3, pushbacks: 3,
    incidents: 3, pastIncidents: 3,
    recency: 1.0, lastCitedDaysAgo: 1,
    lastCitedAt: new Date().toISOString(),
    centrality: 1.0, crossRef: 1.0,
  } as any;
  const empty = {
    reinforcement: 0, references: 0, ref: 0,
    pushback: 0, pushbacks: 0,
    incidents: 0, pastIncidents: 0,
    recency: 0, lastCitedDaysAgo: 9999,
    lastCitedAt: "2020-01-01T00:00:00.000Z",
    centrality: 0, crossRef: 0,
  } as any;
  const a = verdict(section, strong, 1.0);
  const b = verdict(section, empty, 1.0);
  assert.ok(rank(a) >= rank(b), `monotone violation: strong=${a} empty=${b}`);
});
