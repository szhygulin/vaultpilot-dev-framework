// RunState exposes maxCostUsd.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 types runstate maxcostusd", () => {
  const src = readFileSync(resolve(process.cwd(), "src/types.ts"), "utf8");
  assert.match(src, /RunState[\s\S]*?maxCostUsd\s*\?\s*:\s*number/);
});
