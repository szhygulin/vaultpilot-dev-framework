import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("claudeBinPath return type is string or undefined", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /claudeBinPath\s*\(\s*\)\s*:\s*(string\s*\|\s*undefined|undefined\s*\|\s*string|string)/);
});
