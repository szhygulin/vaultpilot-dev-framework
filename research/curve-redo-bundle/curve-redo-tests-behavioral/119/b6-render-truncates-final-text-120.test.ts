// renderResumeBlock dynamic-import behavioral.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderResumeBlock } from "./prompt.js";

test("b6 render truncates final text 120", () => {
  const out = renderResumeBlock({ branch: "b", runId: "r", agentId: "a", finalText: "x".repeat(500) });
  const m = /Last meaningful action recorded:\s*(.+)$/m.exec(out);
  assert.ok(m);
  assert.ok(m[1].length <= 120);
});
