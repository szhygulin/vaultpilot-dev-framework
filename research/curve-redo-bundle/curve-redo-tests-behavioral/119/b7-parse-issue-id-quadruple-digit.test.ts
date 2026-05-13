// parseIssueIdFromBranch dynamic-import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIssueIdFromBranch } from "../cli.js";

test("b7 parse issue id quadruple digit", () => {
  assert.equal(parseIssueIdFromBranch("vp-dev/agent-aa00/issue-1234-incomplete-run-Y"), 1234);
});
