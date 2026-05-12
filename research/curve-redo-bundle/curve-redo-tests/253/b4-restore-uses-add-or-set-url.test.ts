// restoreOriginRemote must run either `remote add` or `remote set-url`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("restoreOriginRemote invokes `git remote add` (with set-url fallback)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  const fnIdx = src.indexOf("function restoreOriginRemote");
  assert.ok(fnIdx > 0);
  const body = src.slice(fnIdx, fnIdx + 2000);
  assert.match(body, /"remote",\s*"add"|remote.*add.*origin/);
});
