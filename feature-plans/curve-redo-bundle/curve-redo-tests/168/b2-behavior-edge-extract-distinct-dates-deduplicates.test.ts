import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDistinctDates } from "./compactClaudeMd.js";

test("extractDistinctDates: same date repeated still yields size 1 (distinct semantics)", () => {
  const dates = extractDistinctDates(
    "2026-05-07 first. Again 2026-05-07. And once more 2026-05-07.",
  );
  assert.equal(dates.size, 1);
  assert.ok(dates.has("2026-05-07"));
});
