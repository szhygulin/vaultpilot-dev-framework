import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: heavy references signal on tiny section is not 'drop'", () => {
  const section = { id: "s0", bytes: 1 } as any;
  const record = {
    reinforcement: 50, references: 50, ref: 50, refCount: 50, referenceCount: 50,
    pushback: 0, pushbacks: 0,
    incidents: 0, pastIncidents: 0,
    recency: 0, lastCitedDaysAgo: 9999,
    centrality: 0, crossRef: 0,
  } as any;
  const result = verdict(section, record, 1.0);
  assert.notEqual(result, "drop");
});
