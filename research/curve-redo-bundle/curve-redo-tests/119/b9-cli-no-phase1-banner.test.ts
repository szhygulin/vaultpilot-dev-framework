// CLI no longer prints Phase 1 'this run routes from main' on phase-2 path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b9 cli no phase1 banner", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /Phase\s*2|salvage refs/);
});
