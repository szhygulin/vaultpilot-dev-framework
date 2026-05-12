// Catches/warns on failure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 orch non blocking warn", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/orchestrator.ts"), "utf8");
  assert.match(src, /catch\s*\(\s*err\s*\)[\s\S]*?post_mortem_failed|post_mortem_failed[\s\S]*?warn/);
});
