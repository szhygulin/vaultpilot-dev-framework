import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: success metric — ref>=3 AND incidents>=1 AND recent keeps", () => {
  const section = { id: "s0", bytes: 50, heading: "Hot rule", body: "frequently relevant" } as any;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const record = {
    reinforcement: 8, references: 8, ref: 8,
    pushback: 2, pushbacks: 2,
    incidents: 2, pastIncidents: 2,
    recency: 1.0, lastCitedDaysAgo: 3, lastCited: 3,
    lastCitedAt: new Date(now - 3 * day).toISOString(),
    centrality: 0.8, crossRef: 0.8,
  } as any;
  assert.equal(verdict(section, record, 1.0), "keep");
});
