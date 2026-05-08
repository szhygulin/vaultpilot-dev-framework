import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDistinctXrefs } from "./tightenClaudeMd.js";

test("extractDistinctXrefs ignores hash tokens without trailing digits", () => {
  const result = extractDistinctXrefs("see #abc and #foo and ## heading");
  assert.equal(result.size, 0);
});
