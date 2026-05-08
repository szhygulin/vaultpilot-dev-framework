import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDistinctDates } from "./compactClaudeMd.js";

test("extractDistinctDates: version numbers and short numerics produce empty set", () => {
  const dates = extractDistinctDates(
    "v1.2.3, port 8080, count 42, semver 0.0.1 — none of these are dates.",
  );
  assert.equal(dates.size, 0);
});
