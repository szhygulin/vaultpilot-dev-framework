import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDistinctNumerics } from "./tightenClaudeMd.js";

test("extractDistinctNumerics ignores K=3 and factor 1.5 style scalars", () => {
  const result = extractDistinctNumerics("K=3 with factor 1.5 applied at gain 2.0");
  assert.equal(result.size, 0);
});
