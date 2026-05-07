import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "./assessClaudeMd.js";

test("composeUtility: empty utility record collapses to 0", () => {
  const compose = (mod as any).composeUtility;
  assert.equal(typeof compose, "function", "composeUtility export must be a function");
  const empty = {
    reinforcement: 0, references: 0, ref: 0, refCount: 0,
    pushback: 0, pushbacks: 0, pushbackCount: 0,
    incidents: 0, pastIncidents: 0, incidentCount: 0,
    recency: 0, lastCitedDaysAgo: 9999,
    lastCitedAt: "2020-01-01T00:00:00.000Z",
    centrality: 0, crossRef: 0,
  };
  const u = compose(empty);
  assert.equal(typeof u, "number");
  assert.ok(u >= 0 && u <= 0.001, `expected ~0, got ${u}`);
});
