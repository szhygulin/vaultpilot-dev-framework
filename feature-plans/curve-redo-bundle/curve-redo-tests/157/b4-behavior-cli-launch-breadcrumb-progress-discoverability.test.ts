// Across both surfaces the breadcrumb cites 'vp-dev status' at least 4
// times: bare and --watch in --plan, bare and --watch at confirm exit.
// This is the strongest pin on the issue's discoverability fix.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts mentions `vp-dev status` >= 4 times across plan and confirm paths", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const matches = src.match(/vp-dev status/g) ?? [];
  assert.ok(
    matches.length >= 4,
    `expected >=4 'vp-dev status' mentions (bare + --watch, in both plan and confirm), got ${matches.length}`,
  );
});
