// renderResumeBlock dynamic-import behavioral.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderResumeBlock } from "./prompt.js";

test("b6 render includes git log cmd", () => {
  const out = renderResumeBlock({ branch: "b", runId: "r", agentId: "a" });
  assert.match(out, /git\s+log\s+--oneline\s+origin\/main\.\.HEAD/);
});
