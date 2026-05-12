import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("env-var name remains canonical: VP_DEV_CLAUDE_BIN (not renamed)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /\bVP_DEV_CLAUDE_BIN\b/);
});
