import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("worktree.test.ts imports ensureOriginRemote", () => {
  const src = readFileSync(resolve(process.cwd(), "src/git/worktree.test.ts"), "utf8");
  assert.match(src, /ensureOriginRemote/);
});
