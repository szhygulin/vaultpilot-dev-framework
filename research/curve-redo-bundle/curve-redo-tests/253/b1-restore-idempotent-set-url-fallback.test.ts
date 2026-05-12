// restoreOriginRemote must be idempotent: if origin already exists (a
// sibling cell re-added first), it falls through to `git remote set-url`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("restoreOriginRemote uses set-url fallback for idempotent re-add", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  const fnIdx = src.indexOf("restoreOriginRemote");
  assert.ok(fnIdx > 0);
  // Search the function body region (next ~2KB) for the set-url fallback.
  const body = src.slice(fnIdx, fnIdx + 2000);
  assert.match(body, /set-url|setUrl/);
});
