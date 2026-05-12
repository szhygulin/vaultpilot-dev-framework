import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("preflight defaults envClaudeBinPath to claudeBinPath", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /deps\.envClaudeBinPath\s*\?\?\s*claudeBinPath|envClaudeBinPath\s*=\s*claudeBinPath/);
});
