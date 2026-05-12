import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("ensureOriginRemote accepts targetRepo parameter (owner/repo slug)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/git/worktree.ts"), "utf8");
  const fnIdx = src.indexOf("function ensureOriginRemote");
  assert.ok(fnIdx > 0);
  const sig = src.slice(fnIdx, fnIdx + 300);
  assert.match(sig, /targetRepo/);
});
