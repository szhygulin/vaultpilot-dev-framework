import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("env-var check uses length-based or truthy guard not strict-undefined", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /v\s*&&\s*v\.length\s*>\s*0|VP_DEV_CLAUDE_BIN\s*\?|VP_DEV_CLAUDE_BIN\)\s*\{/);
});
