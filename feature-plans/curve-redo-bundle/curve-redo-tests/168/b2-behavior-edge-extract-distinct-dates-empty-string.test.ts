import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDistinctDates } from "./compactClaudeMd.js";

test("extractDistinctDates: empty string yields empty set", () => {
  const dates = extractDistinctDates("");
  assert.equal(dates.size, 0);
});
