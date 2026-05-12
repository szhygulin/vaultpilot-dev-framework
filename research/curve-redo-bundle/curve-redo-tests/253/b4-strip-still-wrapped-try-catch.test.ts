import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("remote remove is still wrapped in try/catch (idempotent)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  const fnIdx = src.indexOf("function applyReplayRollback");
  assert.ok(fnIdx > 0);
  const body = src.slice(fnIdx, fnIdx + 4000);
  assert.match(body, /try\s*\{[\s\S]*?remove[\s\S]*?\}\s*catch/);
});
