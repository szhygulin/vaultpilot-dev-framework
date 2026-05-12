// parseIssueIdFromBranch dynamic-import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIssueIdFromBranch } from "../cli.js";

test("b7 parse issue id double digit", () => {
  assert.equal(parseIssueIdFromBranch("vp-dev/agent-aa00/issue-88-incomplete-run-X"), 88);
});
