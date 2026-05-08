import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDistinctNumerics } from "./tightenClaudeMd.js";

test("extractDistinctNumerics ignores bare numbers without unit suffix", () => {
  const result = extractDistinctNumerics("count is 100 and limit is 50 in total");
  assert.equal(result.size, 0);
});
