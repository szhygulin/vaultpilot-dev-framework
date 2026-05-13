// renderResumeBlock dynamic-import behavioral.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderResumeBlock } from "./prompt.js";

test("b6 render mentions prior agent", () => {
  const out = renderResumeBlock({ branch: "b", runId: "r", agentId: "agent-XYZ" });
  assert.match(out, /prior agent.*agent-XYZ|agent-XYZ.*prior/is);
});
