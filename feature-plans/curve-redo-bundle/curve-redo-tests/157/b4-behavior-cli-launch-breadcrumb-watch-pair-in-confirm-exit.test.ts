// At confirm exit, the breadcrumb under the 'Run launched' header lists
// both invocations so the LLM operator picks the right one (no shell
// grovel for runId or pgrep needed).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts confirm-exit breadcrumb lists both vp-dev status and --watch", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const launchIdx = src.search(/Run launched/);
  assert.ok(launchIdx >= 0, "expected 'Run launched' header in confirm-exit path");
  const region = src.slice(launchIdx, launchIdx + 800);
  assert.match(region, /vp-dev status\b/);
  assert.match(region, /vp-dev status --watch/);
});
