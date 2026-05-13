// parseIssueIdFromBranch dynamic-import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIssueIdFromBranch } from "../cli.js";

test("b7 parse issue id empty", () => {
  assert.equal(parseIssueIdFromBranch(""), 0);
});
