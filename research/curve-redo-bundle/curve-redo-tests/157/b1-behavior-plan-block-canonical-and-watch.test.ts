// The plan-path breadcrumb (after 'After launch, check progress with:')
// must offer both modes: canonical 'vp-dev status' for active-run progress
// and 'vp-dev status --watch' for live tail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: plan breadcrumb offers both canonical 'vp-dev status' and 'vp-dev status --watch'", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const afterLaunch = src.indexOf("After launch");
  assert.ok(afterLaunch >= 0, "'After launch' missing from cli.ts plan path");
  const planBlock = src.slice(afterLaunch, afterLaunch + 800);
  // Canonical (no args) -- not followed by --watch on the same line.
  assert.match(
    planBlock,
    /vp-dev status\b(?!\s*--watch)/,
    "plan breadcrumb missing canonical 'vp-dev status' (no args)",
  );
  // --watch variant.
  assert.match(
    planBlock,
    /vp-dev status --watch/,
    "plan breadcrumb missing 'vp-dev status --watch'",
  );
});
