import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("sdkBinary does not mutate process.env (no assignment)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.doesNotMatch(src, /process\.env\.[A-Z_]+\s*=\s*/);
});
