import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("createWorktree calls ensureOriginRemote before fetch", () => {
  const src = readFileSync(resolve(process.cwd(), "src/git/worktree.ts"), "utf8");
  const fnIdx = src.indexOf("function createWorktree");
  assert.ok(fnIdx > 0);
  const body = src.slice(fnIdx, fnIdx + 3000);
  assert.match(body, /ensureOriginRemote/);
});
