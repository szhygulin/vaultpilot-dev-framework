import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("preflightSdkBinary signature accepts deps for testability", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /preflightSdkBinary\s*\(\s*deps[^)]*\)/);
});
