import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("replay.ts has at least 2 exports (applyReplayRollback + restoreOriginRemote)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  const matches = src.match(/^\s*export\s+/gm) || [];
  assert.ok(matches.length >= 2, `expected ≥2 exports, found ${matches.length}`);
});
