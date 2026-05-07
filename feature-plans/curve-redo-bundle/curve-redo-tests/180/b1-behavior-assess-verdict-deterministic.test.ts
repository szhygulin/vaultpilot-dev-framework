import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: deterministic across repeat calls", () => {
  const section = { id: "s0", bytes: 1000 } as any;
  const record = {
    reinforcement: 3,
    pushback: 1,
    incidents: 2,
    lastCitedDaysAgo: 7,
    crossRefCentrality: 0.3,
  } as any;
  const a = verdict(section, record, 1.5);
  const b = verdict(section, record, 1.5);
  const c = verdict(section, record, 1.5);
  assert.equal(a, b);
  assert.equal(b, c);
});
