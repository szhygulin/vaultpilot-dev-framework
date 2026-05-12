// newRunState passed maxCostUsd.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 cli newrunstate passes budget", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /maxCostUsd\s*:\s*budgetUsd/);
});
