// newRunState accepts maxCostUsd.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 new run accepts max cost", () => {
  const src = readFileSync(resolve(process.cwd(), "src/state/runState.ts"), "utf8");
  assert.match(src, /newRunState[\s\S]*?maxCostUsd\s*\?\s*:\s*number/);
});
