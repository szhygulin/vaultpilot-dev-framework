import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: strong-signal record on small section returns 'keep'", () => {
  const section = { id: "s0", bytes: 10, heading: "Rule", body: "keep me" } as any;
  const record = {
    reinforcement: 14, references: 14, ref: 14, refCount: 14, referenceCount: 14,
    pushback: 3, pushbacks: 3, pushbackCount: 3,
    incidents: 3, pastIncidents: 3, incidentCount: 3, incidentDensity: 1,
    recency: 1.0, lastCitedDaysAgo: 1, lastCited: 1,
    lastCitedAt: new Date().toISOString(),
    centrality: 1.0, crossRef: 1.0, crossReferenceCentrality: 1.0,
  } as any;
  const result = verdict(section, record, 1.0);
  assert.equal(result, "keep");
});
