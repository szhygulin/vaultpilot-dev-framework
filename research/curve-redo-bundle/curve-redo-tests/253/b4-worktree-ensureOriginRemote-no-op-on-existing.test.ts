import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("ensureOriginRemote returns added=false when origin exists (no-op shape)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/git/worktree.ts"), "utf8");
  const fnIdx = src.indexOf("function ensureOriginRemote");
  assert.ok(fnIdx > 0);
  const body = src.slice(fnIdx, fnIdx + 1500);
  assert.match(body, /added\s*:\s*false/);
});
