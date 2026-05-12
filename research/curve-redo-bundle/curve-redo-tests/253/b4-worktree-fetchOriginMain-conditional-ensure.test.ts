import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("fetchOriginMain conditionally calls ensureOriginRemote when targetRepo provided", () => {
  const src = readFileSync(resolve(process.cwd(), "src/git/worktree.ts"), "utf8");
  const fnIdx = src.indexOf("function fetchOriginMain");
  assert.ok(fnIdx > 0);
  const body = src.slice(fnIdx, fnIdx + 1000);
  assert.match(body, /if\s*\(\s*targetRepo|targetRepo\s*&&|ensureOriginRemote/);
});
