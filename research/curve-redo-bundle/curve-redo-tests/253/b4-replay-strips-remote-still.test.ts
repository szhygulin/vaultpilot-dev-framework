// Regression: the strip step is still part of applyReplayRollback's flow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("applyReplayRollback still calls `git remote remove origin`", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  assert.match(src, /"remote",\s*"remove",\s*"origin"|remote.*remove.*origin/);
});
