// Spread maxCostUsd in newRunState.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 new run spread maxcost", () => {
  const src = readFileSync(resolve(process.cwd(), "src/state/runState.ts"), "utf8");
  assert.match(src, /\.\.\.\(opts\.maxCostUsd/);
});
