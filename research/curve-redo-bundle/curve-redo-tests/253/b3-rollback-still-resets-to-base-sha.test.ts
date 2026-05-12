// Regression: the reset --hard baseSha is the load-bearing behavior of
// applyReplayRollback — the fix must not remove it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("applyReplayRollback still resets --hard to baseSha", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  assert.match(src, /reset.*--hard|"reset",\s*"--hard"/);
});
