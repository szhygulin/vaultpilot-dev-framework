// RunIssueCoreInput.budgetUsd.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b4 ric budget usd input", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/runIssueCore.ts"), "utf8");
  assert.match(src, /RunIssueCoreInput[\s\S]*?budgetUsd\s*\?\s*:\s*number/);
});
