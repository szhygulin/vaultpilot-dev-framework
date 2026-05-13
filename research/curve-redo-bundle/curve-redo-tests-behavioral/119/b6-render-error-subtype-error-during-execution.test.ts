// renderResumeBlock dynamic-import behavioral.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderResumeBlock } from "./prompt.js";

test("b6 render error subtype error during execution", () => {
  const out = renderResumeBlock({ branch: "b", runId: "r", agentId: "a", errorSubtype: "error_during_execution" });
  assert.match(out, /error_during_execution/);
});
