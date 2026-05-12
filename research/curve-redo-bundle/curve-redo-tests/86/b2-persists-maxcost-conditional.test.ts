// newRunState only persists when set.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 persists maxcost conditional", () => {
  const src = readFileSync(resolve(process.cwd(), "src/state/runState.ts"), "utf8");
  assert.match(src, /maxCostUsd\s*!==\s*undefined\s*\?\s*\{\s*maxCostUsd/);
});
