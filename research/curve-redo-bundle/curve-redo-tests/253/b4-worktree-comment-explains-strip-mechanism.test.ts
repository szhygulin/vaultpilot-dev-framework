import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("worktree.ts comment explains the curve-redo replay-mode strip mechanism", () => {
  const src = readFileSync(resolve(process.cwd(), "src/git/worktree.ts"), "utf8");
  assert.match(src, /replay.mode|applyReplayRollback|curve-redo/i);
});
