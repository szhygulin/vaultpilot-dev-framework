import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: section with zero utility on every signal is dropped", () => {
  const section = { id: "s9", bytes: 4000 } as any;
  const record = {
    reinforcement: 0,
    pushback: 0,
    incidents: 0,
    lastCitedDaysAgo: 9999,
    crossRefCentrality: 0,
  } as any;
  const v = verdict(section, record, 1.0);
  assert.equal(v, "drop");
});
