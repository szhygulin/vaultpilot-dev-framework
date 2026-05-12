import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("applyReplayRollback still calls `git reset --hard`", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  assert.match(src, /"reset",\s*"--hard"|reset.*--hard/);
});
