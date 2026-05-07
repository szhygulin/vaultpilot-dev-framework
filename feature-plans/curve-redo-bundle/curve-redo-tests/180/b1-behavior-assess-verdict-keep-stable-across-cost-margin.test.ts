import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: clearly-kept section is stable across nearby cost factors", () => {
  const section = { id: "s0", bytes: 100 } as any;
  const record = {
    reinforcement: 50,
    pushback: 20,
    incidents: 10,
    lastCitedDaysAgo: 0,
    crossRefCentrality: 1,
  } as any;
  for (const factor of [0.05, 0.1, 0.2]) {
    assert.equal(verdict(section, record, factor), "keep", `factor=${factor}`);
  }
});
