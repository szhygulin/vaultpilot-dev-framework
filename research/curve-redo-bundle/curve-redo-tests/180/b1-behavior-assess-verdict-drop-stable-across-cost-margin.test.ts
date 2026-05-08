import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: clearly-dropped section is stable across nearby cost factors", () => {
  const section = { id: "s9", bytes: 5000 } as any;
  const record = {
    reinforcement: 0,
    pushback: 0,
    incidents: 0,
    lastCitedDaysAgo: 9999,
    crossRefCentrality: 0,
  } as any;
  for (const factor of [0.5, 1.0, 2.0, 5.0]) {
    assert.equal(verdict(section, record, factor), "drop", `factor=${factor}`);
  }
});
