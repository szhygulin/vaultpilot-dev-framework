import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("ensureOriginRemote uses try/catch around get-url probe", () => {
  const src = readFileSync(resolve(process.cwd(), "src/git/worktree.ts"), "utf8");
  const fnIdx = src.indexOf("function ensureOriginRemote");
  assert.ok(fnIdx > 0);
  const body = src.slice(fnIdx, fnIdx + 1500);
  assert.match(body, /try\s*\{[\s\S]*?catch/);
});
