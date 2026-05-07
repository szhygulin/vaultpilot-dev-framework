// Same invariant as cost monotonicity but on the bytes axis.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

const RANK: Record<string, number> = { keep: 2, trim: 1, drop: 0 };

test("verdict: rising section.bytes never strengthens the verdict", () => {
  const record = {} as any;
  const factor = 2.0;
  let lastRank = Infinity;
  for (const bytes of [10, 100, 500, 2048, 8192, 50_000, 200_000]) {
    const v = verdict({ bytes } as any, record, factor);
    const r = RANK[v as string];
    assert.ok(r !== undefined, `unknown verdict ${v}`);
    assert.ok(
      r <= lastRank,
      `verdict rank rose from ${lastRank} to ${r} when bytes increased to ${bytes}`,
    );
    lastRank = r;
  }
});
