import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDistinctXrefs } from "./tightenClaudeMd.js";

test("extractDistinctXrefs ignores plain digit runs without a leading hash", () => {
  const result = extractDistinctXrefs("see issue 137 and number 42 reported");
  assert.equal(result.size, 0);
});
