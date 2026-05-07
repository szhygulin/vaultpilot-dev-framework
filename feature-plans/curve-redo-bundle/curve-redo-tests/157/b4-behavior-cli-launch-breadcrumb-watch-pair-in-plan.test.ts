// In --plan output, the issue specifies BOTH the bare-status invocation
// and the --watch invocation should be listed so operators choose.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts --plan output lists both vp-dev status and vp-dev status --watch", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const planIdx = src.search(/After launch/i);
  assert.ok(planIdx >= 0, "src/cli.ts should have an 'After launch' section in --plan output");
  const planRegion = src.slice(planIdx, planIdx + 800);
  assert.match(planRegion, /vp-dev status\b/);
  assert.match(planRegion, /vp-dev status --watch/);
});
