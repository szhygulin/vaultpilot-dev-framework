// parseIssueIdFromBranch dynamic-import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIssueIdFromBranch } from "../cli.js";

test("b7 parse issue id malformed no incomplete", () => {
  assert.equal(parseIssueIdFromBranch("vp-dev/agent-aa00/issue-88"), 0);
});
