// Regression: applyReplayRollback must still strip origin so the agent
// can't fetch from it during replay. The fix adds a return value but
// doesn't remove the strip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("applyReplayRollback retains the origin-strip behavior", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  assert.match(src, /remote.*remove.*origin|remote",\s*"remove",\s*"origin/i);
});
