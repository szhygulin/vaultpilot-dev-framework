// To cut the progress-discovery footprint from 4 commands to 1 in BOTH
// the plan and confirm exit paths, the string `vp-dev status` should
// appear at least twice in src/cli.ts (once per path), even before
// counting any --watch suffix.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts references `vp-dev status` in both plan and confirm paths", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const occurrences = src.match(/vp-dev status/g) ?? [];
  assert.ok(
    occurrences.length >= 2,
    `expected at least 2 mentions of 'vp-dev status' in src/cli.ts (one for --plan, one for --confirm exit), got ${occurrences.length}`,
  );
});
