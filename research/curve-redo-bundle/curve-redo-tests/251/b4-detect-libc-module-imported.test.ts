// Either built-in process.report or the detect-libc package is used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("sdkBinary uses libc detection mechanism (process.report or detect-libc)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  const hasBuiltIn = /process\.report|getReport|glibcVersionRuntime/.test(src);
  const hasLib = /detect-libc/.test(src);
  assert.ok(hasBuiltIn || hasLib, "no libc-detection mechanism found");
});
