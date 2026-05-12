import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("worktree.ts ends with newline", () => {
  const src = readFileSync(resolve(process.cwd(), "src/git/worktree.ts"), "utf8");
  assert.ok(src.endsWith("\n"));
});
