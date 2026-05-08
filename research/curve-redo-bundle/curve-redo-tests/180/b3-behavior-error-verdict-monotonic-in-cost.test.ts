// Monotonicity invariant on the threshold ladder. Catches reversed comparisons or sign errors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

const RANK: Record<string, number> = { keep: 2, trim: 1, drop: 0 };

test("verdict: rising contextCostFactor never strengthens (raises rank of) the verdict", () => {
  const section = { bytes: 4096 } as any;
  const record = {} as any;
  let lastRank = Infinity;
  for (const factor of [0.1, 0.5, 1, 2, 4, 8, 16, 64, 256]) {
    const v = verdict(section, record, factor);
    const r = RANK[v as string];
    assert.ok(r !== undefined, `unknown verdict ${v}`);
    assert.ok(
      r <= lastRank,
      `verdict rank rose from ${lastRank} to ${r} when cost increased to ${factor}`,
    );
    lastRank = r;
  }
});
