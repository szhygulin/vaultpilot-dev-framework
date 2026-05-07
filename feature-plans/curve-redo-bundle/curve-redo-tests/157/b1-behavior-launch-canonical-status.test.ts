// End-to-end: the fix promises that both the --confirm exit path and the
// --plan output direct operators at 'vp-dev status', the canonical
// progress-check affordance. This test pins both blocks at once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: both confirm-path and plan-path blocks recommend 'vp-dev status'", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const launched = src.indexOf("Run launched");
  const afterLaunch = src.indexOf("After launch");
  assert.ok(launched >= 0, "'Run launched' header missing from confirm path");
  assert.ok(afterLaunch >= 0, "'After launch' instruction missing from plan path");
  const confirmBlock = src.slice(launched, launched + 600);
  const planBlock = src.slice(afterLaunch, afterLaunch + 600);
  assert.match(
    confirmBlock,
    /vp-dev status\b/,
    "confirm breadcrumb does not recommend 'vp-dev status'",
  );
  assert.match(
    planBlock,
    /vp-dev status\b/,
    "plan breadcrumb does not recommend 'vp-dev status'",
  );
});
