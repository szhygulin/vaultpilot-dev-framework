import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("ApplyReplayRollbackResult interface is exported (export keyword)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  assert.match(src, /export\s+interface\s+ApplyReplayRollbackResult/);
});
