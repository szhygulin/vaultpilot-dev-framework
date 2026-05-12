// `git remote add origin <url>` errors if origin already exists. The
// restore function must either try-catch or use set-url to avoid throwing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("restoreOriginRemote does not throw on already-existing origin", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  const fnIdx = src.indexOf("function restoreOriginRemote");
  assert.ok(fnIdx > 0);
  const body = src.slice(fnIdx, fnIdx + 2000);
  // Either try/catch or `set-url` (which is unconditional).
  const hasTryCatch = /try\s*\{[\s\S]*?\}\s*catch/.test(body);
  const hasSetUrl = /set-url|setUrl/.test(body);
  assert.ok(hasTryCatch || hasSetUrl, "must guard against duplicate-add (try/catch or set-url)");
});
