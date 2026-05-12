// renderResumeBlock dynamic-import behavioral.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderResumeBlock } from "./prompt.js";

test("b6 render collapses whitespace", () => {
  const out = renderResumeBlock({ branch: "b", runId: "r", agentId: "a", finalText: "line1\n\nline2\tline3" });
  const m = /Last meaningful action recorded:\s*(.+)$/m.exec(out);
  assert.ok(m);
  assert.doesNotMatch(m[1], /\t/);
  assert.doesNotMatch(m[1], /\n/);
});
