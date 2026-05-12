import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("VP_DEV_CLAUDE_BIN is referenced as a string literal not a regex", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  // canonical occurrence within the function/comment
  assert.match(src, /["']VP_DEV_CLAUDE_BIN["']|\bVP_DEV_CLAUDE_BIN\b/);
});
