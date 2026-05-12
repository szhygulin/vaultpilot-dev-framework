import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("applyReplayRollback signature retains worktreePath + baseSha", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  const fnIdx = src.indexOf("function applyReplayRollback");
  assert.ok(fnIdx > 0);
  const sig = src.slice(fnIdx, fnIdx + 400);
  assert.match(sig, /worktreePath/);
  assert.match(sig, /baseSha/);
});
