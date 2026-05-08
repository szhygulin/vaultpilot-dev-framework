import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

function rank(v: string): number {
  // 'keep' is the most-retain decision, 'drop' is the least-retain.
  // Sorted from most-retain to least-retain.
  if (v === "keep") return 2;
  if (v === "trim") return 1;
  if (v === "drop") return 0;
  return -1;
}

test("verdict is monotone in bytes (more bytes -> not more retentive) for an empty record", () => {
  const small = verdict({ bytes: 100 } as any, {} as any, 1.0) as string;
  const big = verdict({ bytes: 100_000 } as any, {} as any, 1.0) as string;
  const huge = verdict({ bytes: 10_000_000 } as any, {} as any, 1.0) as string;
  // Each step should retain less (or stay the same).
  assert.ok(
    rank(small) >= rank(big),
    `expected small (${small}) at least as retentive as big (${big})`,
  );
  assert.ok(
    rank(big) >= rank(huge),
    `expected big (${big}) at least as retentive as huge (${huge})`,
  );
});
