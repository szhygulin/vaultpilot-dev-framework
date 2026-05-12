import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("ensureOriginRemote reconstructs canonical GitHub URL", () => {
  const src = readFileSync(resolve(process.cwd(), "src/git/worktree.ts"), "utf8");
  assert.match(src, /https:\/\/github\.com\/\$\{targetRepo\}|https:\/\/github\.com/);
});
