// Per-issue weights sum to 1.0; saturation must clamp the output, not let it exceed 1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: extreme counts clamp at <= 1.0", () => {
  const huge: any = {
    ref: 1e9,
    refs: 1e9,
    reinforcement: 1e9,
    reinforcementCount: 1e9,
    pushback: 1e9,
    pushbackCount: 1e9,
    incidents: 1e9,
    incidentCount: 1e9,
    recency: 1.0,
    centrality: 1.0,
    crossRefCentrality: 1.0,
    lastCitedDays: 0,
  };
  const u = composeUtility(huge);
  assert.ok(Number.isFinite(u), `expected finite, got ${u}`);
  assert.ok(u <= 1.0 + 1e-9, `composeUtility produced ${u}, must clamp at <= 1`);
  assert.ok(u >= 0, `composeUtility produced negative ${u}`);
});
