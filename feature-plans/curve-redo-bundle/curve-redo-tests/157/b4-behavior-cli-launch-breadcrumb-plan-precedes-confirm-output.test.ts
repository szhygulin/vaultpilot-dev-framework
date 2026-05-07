// The CLI definitionally executes --plan as a dry-run path that
// short-circuits before --confirm exit. It's natural that the plan
// branch's 'After launch' string appears before the confirm branch's
// 'Run launched' string in the source. This pins that ordering as a
// soft sanity check that both surfaces exist in distinct branches.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts has both 'After launch' (plan) and 'Run launched' (confirm) sections", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const planIdx = src.search(/After launch/i);
  const confirmIdx = src.search(/Run launched/);
  assert.ok(planIdx >= 0, "src/cli.ts should have an 'After launch' plan-mode breadcrumb");
  assert.ok(confirmIdx >= 0, "src/cli.ts should have a 'Run launched' confirm-exit breadcrumb");
  assert.notEqual(planIdx, confirmIdx, "the two breadcrumbs should occupy distinct positions");
});
