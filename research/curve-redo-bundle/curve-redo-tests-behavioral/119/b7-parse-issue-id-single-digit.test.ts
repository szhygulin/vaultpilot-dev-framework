// parseIssueIdFromBranch dynamic-import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIssueIdFromBranch } from "../cli.js";

test("b7 parse issue id single digit", () => {
  assert.equal(parseIssueIdFromBranch("vp-dev/agent-bb/issue-7-incomplete-run-Z"), 7);
});
