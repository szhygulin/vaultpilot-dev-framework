import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("env-var is read via process.env.VP_DEV_CLAUDE_BIN", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /process\.env\.VP_DEV_CLAUDE_BIN|process\.env\[['"]VP_DEV_CLAUDE_BIN/);
});
