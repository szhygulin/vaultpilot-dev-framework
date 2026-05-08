// In the --plan output, the 'After launch' instruction should be followed
// by the canonical 'vp-dev status' suggestion within the plan breadcrumb.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: plan-path 'After launch' instruction precedes a 'vp-dev status' suggestion", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /After launch[\s\S]{0,500}vp-dev status/);
});
