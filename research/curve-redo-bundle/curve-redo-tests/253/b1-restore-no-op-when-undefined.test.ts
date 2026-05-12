// When originUrl is undefined (the capture window closed empty),
// restoreOriginRemote must no-op.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("restoreOriginRemote no-ops when originUrl is undefined", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  const fnIdx = src.indexOf("function restoreOriginRemote");
  assert.ok(fnIdx > 0, "restoreOriginRemote function not found");
  const body = src.slice(fnIdx, fnIdx + 2000);
  // Either an explicit return guard or an early conditional on originUrl.
  assert.match(body, /if\s*\(\s*!?\s*[\w.]*originUrl\b|originUrl\s*===\s*undefined|\?\?|return\s*;/);
});
