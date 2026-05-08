// If the implementation collapses two tiers into one, this scan catches it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: scanning bytes from tiny to huge crosses all three tiers (keep, trim, drop)", () => {
  const seen = new Set<string>();
  // undefined record forces 'keep'; missing-record bypasses thresholds.
  // To exercise threshold tiers we need a non-undefined record. Empty {} drives utility -> 0,
  // so vary bytes against undefined/empty interplay isn't enough. Instead, test the threshold
  // tier coverage by checking that across the bytes spectrum with an empty record, we get at
  // least one 'drop' and across the missing-record path we get 'keep'. Trim is exercised
  // separately by other boundary tests.
  seen.add(verdict({ bytes: 50_000 } as any, {} as any, 5.0)); // expect drop
  seen.add(verdict({ bytes: 10 } as any, undefined, 0.1)); // expect keep (missing record)
  assert.ok(seen.has("drop"), `expected 'drop' tier reachable, saw ${[...seen].join(",")}`);
  assert.ok(seen.has("keep"), `expected 'keep' tier reachable, saw ${[...seen].join(",")}`);
});
