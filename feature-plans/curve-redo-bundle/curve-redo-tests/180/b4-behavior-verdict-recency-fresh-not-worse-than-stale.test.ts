import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

function rank(v: string): number {
  return v === "keep" ? 2 : v === "trim" ? 1 : v === "drop" ? 0 : -1;
}

test("verdict: keepness(fresh-cited) >= keepness(stale-cited) when other signals match", () => {
  const section = { id: "s0", bytes: 50 } as any;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const fresh = {
    reinforcement: 5, references: 5, ref: 5,
    pushback: 1, incidents: 1, pastIncidents: 1,
    recency: 1.0, lastCitedDaysAgo: 1, lastCited: 1,
    lastCitedAt: new Date(now - 1 * day).toISOString(),
    centrality: 0.5, crossRef: 0.5,
  } as any;
  const stale = {
    ...fresh,
    recency: 0, lastCitedDaysAgo: 120, lastCited: 120,
    lastCitedAt: new Date(now - 120 * day).toISOString(),
  } as any;
  const freshV = verdict(section, fresh, 1.0);
  const staleV = verdict(section, stale, 1.0);
  assert.ok(rank(freshV) >= rank(staleV), `expected fresh(${freshV}) >= stale(${staleV})`);
});
