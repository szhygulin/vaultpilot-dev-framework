import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("restoreOriginRemote tries `remote add` first, then `remote set-url`", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  const fnIdx = src.indexOf("function restoreOriginRemote");
  assert.ok(fnIdx > 0);
  const body = src.slice(fnIdx, fnIdx + 2500);
  const addIdx = body.search(/"remote",\s*"add"/);
  const setIdx = body.search(/"remote",\s*"set-url"/);
  // Both should exist; add precedes set-url.
  assert.ok(addIdx > 0, "add path missing");
  assert.ok(setIdx > 0, "set-url fallback missing");
  assert.ok(addIdx < setIdx, "add must precede set-url");
});
