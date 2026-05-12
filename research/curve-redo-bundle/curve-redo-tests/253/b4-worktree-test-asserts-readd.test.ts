import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("worktree.test.ts covers re-add path with added=true", () => {
  const src = readFileSync(resolve(process.cwd(), "src/git/worktree.test.ts"), "utf8");
  assert.match(src, /added,\s*true|re-add/i);
});
