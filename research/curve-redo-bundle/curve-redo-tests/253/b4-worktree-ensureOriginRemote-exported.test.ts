import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("ensureOriginRemote is exported from src/git/worktree.ts", () => {
  const src = readFileSync(resolve(process.cwd(), "src/git/worktree.ts"), "utf8");
  assert.match(src, /export\s+async\s+function\s+ensureOriginRemote/);
});
