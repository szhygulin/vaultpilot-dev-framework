// Resume uses fresh RunCostTracker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 cli resume fresh cost tracker", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /runResume[\s\S]*?new\s+RunCostTracker/);
});
