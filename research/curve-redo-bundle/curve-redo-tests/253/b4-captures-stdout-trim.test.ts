import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("applyReplayRollback uses stdout.trim() for captured originUrl", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  const fnIdx = src.indexOf("function applyReplayRollback");
  assert.ok(fnIdx > 0);
  const body = src.slice(fnIdx, fnIdx + 3500);
  assert.match(body, /stdout\.trim\(\)|trim\(\)/);
});
