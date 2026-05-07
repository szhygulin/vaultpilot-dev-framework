import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDistinctDates } from "./compactClaudeMd.js";

test("extractDistinctDates: single ISO date yields exactly that one entry", () => {
  const dates = extractDistinctDates("On 2026-05-07 the thing happened.");
  assert.equal(dates.size, 1);
  assert.ok(dates.has("2026-05-07"));
});
