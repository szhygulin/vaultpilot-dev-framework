import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("runIssueCore.ts passes targetRepo to createWorktree opts", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/runIssueCore.ts"), "utf8");
  const cwIdx = src.indexOf("createWorktree(");
  assert.ok(cwIdx > 0);
  const window = src.slice(cwIdx, cwIdx + 1000);
  assert.match(window, /targetRepo\s*:/);
});
