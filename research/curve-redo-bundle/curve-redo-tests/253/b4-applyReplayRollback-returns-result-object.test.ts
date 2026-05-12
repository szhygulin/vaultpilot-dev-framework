import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("applyReplayRollback returns object literal with originUrl key", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  const fnIdx = src.indexOf("function applyReplayRollback");
  assert.ok(fnIdx > 0);
  const body = src.slice(fnIdx, fnIdx + 3500);
  assert.match(body, /return\s*\{[\s\S]*?originUrl/);
});
