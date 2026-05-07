import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: heavy incident density on tiny section is not 'drop'", () => {
  const section = { id: "s0", bytes: 1 } as any;
  const record = {
    reinforcement: 0, references: 0, ref: 0,
    pushback: 0, pushbacks: 0,
    incidents: 20, pastIncidents: 20, incidentCount: 20, incidentDensity: 1,
    recency: 0, lastCitedDaysAgo: 9999,
    centrality: 0, crossRef: 0,
  } as any;
  const result = verdict(section, record, 1.0);
  assert.notEqual(result, "drop");
});
