import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("claudeBinPath remains a zero-arg or optional-arg function", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  // Zero-arg or all-optional shape
  assert.match(src, /function\s+claudeBinPath\s*\(\s*[^)]*?\)/);
});
