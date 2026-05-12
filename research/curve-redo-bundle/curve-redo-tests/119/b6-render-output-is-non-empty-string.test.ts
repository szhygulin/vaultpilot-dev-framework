// renderResumeBlock dynamic-import behavioral.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderResumeBlock } from "./prompt.js";

test("b6 render output is non empty string", () => {
  const out = renderResumeBlock({ branch: "b", runId: "r", agentId: "a" });
  assert.equal(typeof out, "string");
  assert.ok(out.length > 50);
});
