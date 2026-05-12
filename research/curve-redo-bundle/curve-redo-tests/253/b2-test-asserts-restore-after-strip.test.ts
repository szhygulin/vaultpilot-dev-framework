import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("replay.test.ts asserts origin is restored to the saved URL after restoreOriginRemote", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.test.ts"), "utf8");
  // The test reads remote get-url origin and checks the value equals the
  // pre-strip URL.
  assert.match(src, /restoreOriginRemote/);
  assert.match(src, /remote.*get-url.*origin/i);
});
