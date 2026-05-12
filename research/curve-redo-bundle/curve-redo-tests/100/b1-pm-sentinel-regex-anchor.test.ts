// Sentinel anchored to ^## .
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 pm sentinel regex anchor", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/failurePostMortem.ts"), "utf8");
  assert.match(src, /POST_MORTEM_SENTINEL[\s\S]*?\^## /);
});
