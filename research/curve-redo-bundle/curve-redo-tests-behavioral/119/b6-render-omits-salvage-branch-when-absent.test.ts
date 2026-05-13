// renderResumeBlock dynamic-import behavioral.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderResumeBlock } from "./prompt.js";

test("b6 render omits salvage branch when absent", () => {
  const out = renderResumeBlock({ branch: "b", runId: "r", agentId: "a" });
  assert.doesNotMatch(out, /Salvage branch/);
});
