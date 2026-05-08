import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: zero-signal record on substantial section returns 'drop'", () => {
  const section = { id: "s9", bytes: 1000, heading: "Stale", body: "never cited" } as any;
  const record = {
    reinforcement: 0, references: 0, ref: 0, refCount: 0, referenceCount: 0,
    pushback: 0, pushbacks: 0, pushbackCount: 0,
    incidents: 0, pastIncidents: 0, incidentCount: 0, incidentDensity: 0,
    recency: 0, lastCitedDaysAgo: 9999, lastCited: 9999,
    lastCitedAt: "2020-01-01T00:00:00.000Z",
    centrality: 0, crossRef: 0, crossReferenceCentrality: 0,
  } as any;
  const result = verdict(section, record, 1.0);
  assert.equal(result, "drop");
});
