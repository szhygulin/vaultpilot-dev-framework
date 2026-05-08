import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: contextCostFactor=0 does not throw and returns a valid verdict", () => {
  const section = { id: "s0", bytes: 100 } as any;
  const record = {
    reinforcement: 5, references: 5, ref: 5,
    pushback: 1, incidents: 1, pastIncidents: 1,
    recency: 1.0, lastCitedDaysAgo: 1,
    lastCitedAt: new Date().toISOString(),
    centrality: 0.5, crossRef: 0.5,
  } as any;
  let out: any;
  assert.doesNotThrow(() => { out = verdict(section, record, 0); });
  assert.ok(out === "keep" || out === "trim" || out === "drop", `unexpected: ${String(out)}`);
});
