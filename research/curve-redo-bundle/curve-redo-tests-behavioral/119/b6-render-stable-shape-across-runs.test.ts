// renderResumeBlock dynamic-import behavioral.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderResumeBlock } from "./prompt.js";

test("b6 render stable shape across runs", () => {
  const a = renderResumeBlock({ branch: "b", runId: "r", agentId: "a" });
  const b = renderResumeBlock({ branch: "b", runId: "r", agentId: "a" });
  assert.equal(a, b);
});
