import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("preflight defaults platform to process.platform", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /deps\.platform\s*\?\?[\s\S]{0,40}process\.platform|platform\s*=\s*\(\s*\)\s*=>\s*process\.platform/);
});
