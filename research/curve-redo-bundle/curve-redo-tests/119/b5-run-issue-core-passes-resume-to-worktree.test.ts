// runIssueCore passes resume branch into createWorktree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 run issue core passes resume to worktree", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/runIssueCore.ts"), "utf8");
  assert.match(src, /resumeFromBranch\s*:\s*input\.resumeContext\?\.branch/);
});
