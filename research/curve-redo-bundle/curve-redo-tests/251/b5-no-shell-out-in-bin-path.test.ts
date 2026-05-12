import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("auto-detect avoids unconditional shell-out — execSync/spawnSync limited", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  // Either no shell call, OR it's gated behind a fallback (allowed).
  const hasExec = /\bexecSync\b|\bspawnSync\b/.test(src);
  const hasGlibcProbe = /glibcVersionRuntime|process\.report|getReport/.test(src);
  // Prefer built-in probe over shell-out. If shell-out exists, the built-in must also exist (fallback).
  if (hasExec) {
    assert.ok(hasGlibcProbe, "shell-out present without built-in probe fallback");
  } else {
    assert.ok(true);
  }
});
