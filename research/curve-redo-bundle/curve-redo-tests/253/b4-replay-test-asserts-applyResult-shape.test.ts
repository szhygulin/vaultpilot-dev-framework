import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("replay.test.ts destructures originUrl from applyReplayRollback's result", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.test.ts"), "utf8");
  assert.match(src, /\{\s*originUrl\s*\}\s*=\s*await\s+applyReplayRollback|const\s+result\s*=\s*await\s+applyReplayRollback/);
});
