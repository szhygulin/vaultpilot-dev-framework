import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("restoreOriginRemote accepts options object with worktreePath + originUrl", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  const fnIdx = src.indexOf("function restoreOriginRemote");
  const sig = src.slice(fnIdx, fnIdx + 300);
  assert.match(sig, /worktreePath/);
  assert.match(sig, /originUrl/);
});
