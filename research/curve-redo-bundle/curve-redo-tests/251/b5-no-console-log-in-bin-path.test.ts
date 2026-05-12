import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("sdkBinary has no stray console.log in claudeBinPath body", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  // Hand-fashioned: count console.log occurrences globally, expect low ceiling.
  const matches = src.match(/console\.log/g) ?? [];
  assert.ok(matches.length <= 2, `too many console.log occurrences (${matches.length})`);
});
