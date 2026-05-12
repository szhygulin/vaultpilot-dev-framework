// renderResumeBlock dynamic-import behavioral.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderResumeBlock } from "./prompt.js";

test("b6 render full context contains agent id", () => {
  const out = renderResumeBlock({ branch: "vp-dev/agent-08c4/issue-1-incomplete-run-X", runId: "run-X", agentId: "agent-08c4" });
  assert.match(out, /agent-08c4/);
});
