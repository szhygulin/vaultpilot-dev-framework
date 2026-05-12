// The new result type must be declared/exported.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("ApplyReplayRollbackResult interface is declared in replay.ts", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  assert.match(src, /interface\s+ApplyReplayRollbackResult/);
});
