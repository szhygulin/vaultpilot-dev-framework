import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("worktree.ts has at least 3 exports (ensureOrigin + fetch + createWorktree)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/git/worktree.ts"), "utf8");
  const matches = src.match(/^\s*export\s+/gm) || [];
  assert.ok(matches.length >= 3, `expected ≥3 exports, found ${matches.length}`);
});
