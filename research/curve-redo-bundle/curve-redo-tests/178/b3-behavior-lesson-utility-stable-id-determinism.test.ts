// Negative: a non-deterministic implementation (e.g. one that mixes in a
// timestamp or PRNG) silently breaks reinforcement attribution across runs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: identical input twice -> identical output", () => {
  const a = deriveStableId("run-2026-05-07-abc", "issue:#177");
  const b = deriveStableId("run-2026-05-07-abc", "issue:#177");
  assert.equal(a, b);
});

test("deriveStableId: identical input across many calls stays stable", () => {
  const expected = deriveStableId("run-X", "issue:#5");
  for (let i = 0; i < 50; i++) {
    assert.equal(deriveStableId("run-X", "issue:#5"), expected);
  }
});
