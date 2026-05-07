import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: success metric — ref=0/incidents=0/no-pushback drops", () => {
  const section = { id: "s9", bytes: 1500, heading: "One-off", body: "never reinforced" } as any;
  const record = {
    reinforcement: 0, references: 0, ref: 0, refCount: 0,
    pushback: 0, pushbacks: 0, pushbackCount: 0,
    incidents: 0, pastIncidents: 0, incidentCount: 0,
    recency: 0, lastCitedDaysAgo: 9999, lastCited: 9999,
    lastCitedAt: "2020-01-01T00:00:00.000Z",
    centrality: 0, crossRef: 0,
  } as any;
  assert.equal(verdict(section, record, 1.0), "drop");
});
