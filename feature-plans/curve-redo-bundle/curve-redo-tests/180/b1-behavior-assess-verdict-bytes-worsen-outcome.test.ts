import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

const rank: Record<string, number> = { keep: 2, trim: 1, drop: 0 };

test("verdict: larger bytes never produces a better verdict than smaller bytes", () => {
  const record = {
    reinforcement: 3,
    pushback: 1,
    incidents: 1,
    lastCitedDaysAgo: 10,
    crossRefCentrality: 0.3,
  } as any;
  const small = verdict({ id: "a", bytes: 100 } as any, record, 1.0);
  const large = verdict({ id: "b", bytes: 100000 } as any, record, 1.0);
  assert.ok(
    rank[large] <= rank[small],
    `large-bytes verdict ${large} should not be better than small-bytes verdict ${small}`,
  );
});
