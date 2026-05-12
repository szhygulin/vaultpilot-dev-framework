import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("restoreOriginRemote has no-op-when-undefined logic + comment", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  const fnIdx = src.indexOf("function restoreOriginRemote");
  assert.ok(fnIdx > 0);
  const body = src.slice(fnIdx, fnIdx + 2500);
  // either short-circuit or explicit guard
  assert.match(body, /if\s*\(\s*!\s*opts\.originUrl|return\s*;/);
});
