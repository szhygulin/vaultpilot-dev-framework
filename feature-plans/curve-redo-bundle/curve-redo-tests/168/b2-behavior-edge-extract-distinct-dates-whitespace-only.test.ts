import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDistinctDates } from "./compactClaudeMd.js";

test("extractDistinctDates: whitespace-only input yields empty set", () => {
  const dates = extractDistinctDates("   \n\t  \n");
  assert.equal(dates.size, 0);
});
