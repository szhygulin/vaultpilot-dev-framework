import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("sdkBinary does not delete process.env.VP_DEV_CLAUDE_BIN", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.doesNotMatch(src, /delete\s+process\.env\.VP_DEV_CLAUDE_BIN/);
});
