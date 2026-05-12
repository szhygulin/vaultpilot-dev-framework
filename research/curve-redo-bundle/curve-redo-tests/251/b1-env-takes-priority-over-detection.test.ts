// Env-var override must be checked BEFORE auto-detection.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("VP_DEV_CLAUDE_BIN check appears before any libc-detect call", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  const envIdx = src.indexOf("VP_DEV_CLAUDE_BIN");
  assert.ok(envIdx > 0);
  // Find the libc-detect signature index (glibcVersionRuntime / getReport)
  const detectMatch = src.match(/glibcVersionRuntime|getReport|detectLibc/);
  if (detectMatch) {
    const detectIdx = src.indexOf(detectMatch[0]);
    assert.ok(envIdx < detectIdx, `env check (${envIdx}) should precede libc detect (${detectIdx})`);
  }
});
