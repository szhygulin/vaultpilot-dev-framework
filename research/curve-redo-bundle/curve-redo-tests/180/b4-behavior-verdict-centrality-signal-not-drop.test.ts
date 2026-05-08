import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: maxed cross-reference centrality on tiny section is not 'drop'", () => {
  const section = { id: "s0", bytes: 1 } as any;
  const record = {
    reinforcement: 0, references: 0, ref: 0,
    pushback: 0, pushbacks: 0,
    incidents: 0, pastIncidents: 0,
    recency: 0, lastCitedDaysAgo: 9999,
    centrality: 1.0, crossRef: 1.0, crossReferenceCentrality: 1.0,
  } as any;
  const result = verdict(section, record, 1.0);
  assert.notEqual(result, "drop");
});
