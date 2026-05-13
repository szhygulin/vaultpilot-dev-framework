// renderResumeBlock dynamic-import behavioral.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderResumeBlock } from "./prompt.js";

test("b6 render error subtype budget exceeded", () => {
  const out = renderResumeBlock({ branch: "b", runId: "r", agentId: "a", errorSubtype: "error_max_budget_usd" });
  assert.match(out, /error_max_budget_usd/);
});
