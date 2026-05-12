// Primary detection should use process.report (zero-cost, built-in).
// `ldd` shell-out is an acceptable fallback but shouldn't dominate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("sdkBinary uses process.report or equivalent built-in detection (not pure ldd)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  // Either glibcVersionRuntime / getReport (built-in) OR an explicit
  // detect-libc dependency import.
  const hasBuiltIn = /glibcVersionRuntime|getReport/.test(src);
  const hasLib = /detect-libc/.test(src);
  assert.ok(hasBuiltIn || hasLib, "auto-detect needs a libc probe (process.report or detect-libc)");
});
