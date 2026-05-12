// renderResumeBlock dynamic-import behavioral.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderResumeBlock } from "./prompt.js";

test("b6 render missing error subtype unknown", () => {
  const out = renderResumeBlock({ branch: "b", runId: "r", agentId: "a" });
  assert.match(out, /unknown/);
});
