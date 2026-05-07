import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

const rank: Record<string, number> = { keep: 2, trim: 1, drop: 0 };

test("verdict: higher contextCostFactor never produces a better verdict", () => {
  const section = { id: "s0", bytes: 1000 } as any;
  const record = {
    reinforcement: 3,
    pushback: 1,
    incidents: 1,
    lastCitedDaysAgo: 10,
    crossRefCentrality: 0.3,
  } as any;
  const cheap = verdict(section, record, 0.1);
  const expensive = verdict(section, record, 100);
  assert.ok(
    rank[expensive] <= rank[cheap],
    `expensive-context verdict ${expensive} should not exceed cheap-context verdict ${cheap}`,
  );
});
