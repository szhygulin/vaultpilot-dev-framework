import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("preflightSdkBinary export is preserved (no regression)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /export\s+function\s+preflightSdkBinary|export\s+\{[^}]*preflightSdkBinary/);
});
