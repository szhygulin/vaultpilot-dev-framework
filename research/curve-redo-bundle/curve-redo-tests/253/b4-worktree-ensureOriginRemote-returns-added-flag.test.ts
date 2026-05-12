import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("ensureOriginRemote returns { added: boolean }", () => {
  const src = readFileSync(resolve(process.cwd(), "src/git/worktree.ts"), "utf8");
  const fnIdx = src.indexOf("function ensureOriginRemote");
  const sig = src.slice(fnIdx, fnIdx + 400);
  assert.match(sig, /added\s*:\s*boolean/);
});
