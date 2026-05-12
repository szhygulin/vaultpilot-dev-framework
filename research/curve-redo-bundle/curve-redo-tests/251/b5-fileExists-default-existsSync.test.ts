import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("preflight defaults fileExists to existsSync", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /deps\.fileExists\s*\?\?\s*existsSync|fileExists\s*=\s*existsSync/);
});
