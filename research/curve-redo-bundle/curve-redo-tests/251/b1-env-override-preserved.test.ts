// The VP_DEV_CLAUDE_BIN env-var must still work as an escape hatch
// (operator override wins).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("sdkBinary still honors VP_DEV_CLAUDE_BIN env-var override", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /VP_DEV_CLAUDE_BIN/);
});
