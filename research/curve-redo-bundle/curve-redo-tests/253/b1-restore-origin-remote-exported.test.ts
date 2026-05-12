// PR #262 added restoreOriginRemote as a new exported function.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("replay.ts exports restoreOriginRemote", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  assert.match(src, /export\s+(async\s+)?function\s+restoreOriginRemote/);
});
