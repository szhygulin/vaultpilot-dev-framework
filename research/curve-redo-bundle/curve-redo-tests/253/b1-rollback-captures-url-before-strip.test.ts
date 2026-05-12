// The fix order must be: capture URL FIRST, then strip. If strip runs
// before capture, the saved URL is empty.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("applyReplayRollback captures origin URL before stripping it", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  const captureIdx = src.search(/remote.*get-url.*origin|originUrl\s*=/i);
  const stripIdx = src.search(/remote.*remove.*origin|remote",\s*"remove",\s*"origin/i);
  assert.ok(captureIdx > 0, "capture pattern missing");
  assert.ok(stripIdx > 0, "strip pattern missing");
  // capture comes before strip in source order
  assert.ok(captureIdx < stripIdx, `capture at ${captureIdx} should precede strip at ${stripIdx}`);
});
