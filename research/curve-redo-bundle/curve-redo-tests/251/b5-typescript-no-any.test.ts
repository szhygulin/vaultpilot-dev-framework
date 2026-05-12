import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("sdkBinary avoids 'any' usage in function signatures", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  // Allow casts, just spot-check function-signature 'any's
  const sigs = src.match(/function\s+\w+\([^)]*\)\s*:\s*any\b/g) ?? [];
  assert.equal(sigs.length, 0);
});
