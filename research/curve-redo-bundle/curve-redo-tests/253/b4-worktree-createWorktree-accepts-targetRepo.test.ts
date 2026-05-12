import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("createWorktree opts type accepts targetRepo for defensive re-add", () => {
  const src = readFileSync(resolve(process.cwd(), "src/git/worktree.ts"), "utf8");
  const fnIdx = src.indexOf("function createWorktree");
  assert.ok(fnIdx > 0);
  const window = src.slice(fnIdx, fnIdx + 1200);
  assert.match(window, /targetRepo/);
});
