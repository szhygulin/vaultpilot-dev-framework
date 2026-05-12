// renderResumeBlock dynamic-import behavioral.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderResumeBlock } from "./prompt.js";

test("b6 render includes salvage branch url", () => {
  const url = "https://github.com/x/y/tree/foo";
  const out = renderResumeBlock({ branch: "b", runId: "r", agentId: "a", partialBranchUrl: url });
  assert.ok(out.includes(url));
});
