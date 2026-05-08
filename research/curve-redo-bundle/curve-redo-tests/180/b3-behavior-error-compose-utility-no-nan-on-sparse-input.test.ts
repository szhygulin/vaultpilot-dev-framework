// NaN propagates and silently destroys verdicts downstream — guard hard.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: sparse records do not yield NaN", () => {
  const candidates: any[] = [
    {},
    { ref: 0 },
    { pushback: 0 },
    { incidents: 0 },
    { ref: 5 },
    { ref: 5, pushback: 1 },
    { incidents: 2 },
  ];
  for (const record of candidates) {
    const u = composeUtility(record);
    assert.ok(!Number.isNaN(u), `composeUtility returned NaN for ${JSON.stringify(record)}`);
    assert.ok(
      Number.isFinite(u),
      `composeUtility returned non-finite ${u} for ${JSON.stringify(record)}`,
    );
  }
});
