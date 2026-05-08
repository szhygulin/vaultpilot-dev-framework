import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: very large section with zero utility drops", () => {
  const section = { id: "s0", bytes: 100_000, heading: "Wall of text", body: "" } as any;
  const record = {
    reinforcement: 0, references: 0, ref: 0,
    pushback: 0, pushbacks: 0,
    incidents: 0, pastIncidents: 0,
    recency: 0, lastCitedDaysAgo: 9999,
    lastCitedAt: "2020-01-01T00:00:00.000Z",
    centrality: 0, crossRef: 0,
  } as any;
  assert.equal(verdict(section, record, 1.0), "drop");
});
