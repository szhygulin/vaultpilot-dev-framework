// Issue #251 — claudeBinPath() auto-detect glibc vs musl. The fix
// modifies src/agent/sdkBinary.ts to detect libc at runtime and select
// the correct sibling artifact under node_modules/@anthropic-ai/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("sdkBinary source exists at src/agent/sdkBinary.ts", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.ok(src.length > 0);
});
