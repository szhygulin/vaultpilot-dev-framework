import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: tiny high-utility section is kept", () => {
  const section = { id: "s0", bytes: 50 } as any;
  const record = {
    reinforcement: 50,
    pushback: 20,
    incidents: 10,
    lastCitedDaysAgo: 0,
    crossRefCentrality: 1,
  } as any;
  const v = verdict(section, record, 0.1);
  assert.equal(v, "keep");
});
