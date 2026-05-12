// createWorktree accepts resumeFromBranch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b4 worktree resume from branch option", () => {
  const src = readFileSync(resolve(process.cwd(), "src/git/worktree.ts"), "utf8");
  assert.match(src, /createWorktree[\s\S]*?resumeFromBranch/);
});
