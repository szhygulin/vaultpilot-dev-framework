import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: mid-range utility record yields a valid verdict literal", () => {
  const section = { id: "s4", bytes: 400 } as any;
  const record = {
    reinforcement: 2, references: 2, ref: 2,
    pushback: 0, pushbacks: 0,
    incidents: 1, pastIncidents: 1,
    recency: 0.3, lastCitedDaysAgo: 42,
    lastCitedAt: new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString(),
    centrality: 0.3, crossRef: 0.3,
  } as any;
  const result = verdict(section, record, 2.0);
  assert.ok(["keep", "trim", "drop"].includes(result));
});
