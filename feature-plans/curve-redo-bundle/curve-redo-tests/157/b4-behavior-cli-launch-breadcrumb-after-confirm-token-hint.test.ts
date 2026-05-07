// The issue specifies the new progress hint must follow the pre-existing
// 'vp-dev run --confirm <token>' line in plan output. Order matters so
// the operator first sees how to launch, then how to monitor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts plan output places the status hint after the --confirm token hint", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const confirmIdx = src.search(/run --confirm/);
  const statusIdx = src.search(/After launch[\s\S]*?vp-dev status/);
  assert.ok(confirmIdx >= 0, "src/cli.ts should still mention 'run --confirm' in plan output");
  assert.ok(statusIdx >= 0, "src/cli.ts should mention 'vp-dev status' under an 'After launch' header");
  assert.ok(statusIdx > confirmIdx, "'After launch' status hint should come AFTER the --confirm token hint");
});
