// Both surfaces need the watch hint, so the literal substring should
// appear at least twice across src/cli.ts (--plan and --confirm exit).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts contains `vp-dev status --watch` in both plan and confirm paths", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const matches = src.match(/vp-dev status --watch/g) ?? [];
  assert.ok(
    matches.length >= 2,
    `expected >=2 mentions of 'vp-dev status --watch' (plan + confirm), got ${matches.length}`,
  );
});
