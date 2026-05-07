// In the --plan output, the 'After launch' instruction should be followed
// by 'vp-dev status --watch' within the plan breadcrumb so the operator
// sees both modes (canonical + live tail).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: plan-path 'After launch' instruction precedes a 'vp-dev status --watch' suggestion", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /After launch[\s\S]{0,500}vp-dev status --watch/);
});
