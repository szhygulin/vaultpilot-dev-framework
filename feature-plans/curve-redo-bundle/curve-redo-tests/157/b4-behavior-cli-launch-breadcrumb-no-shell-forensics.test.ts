// Defensive: the breadcrumb's whole purpose is to replace shell
// forensics, so the breadcrumb itself should not be papered over with
// 'pgrep' or 'ls -lt' suggestions. The 'Run launched' window should be
// free of those tokens.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts launch breadcrumb does not suggest pgrep / ls -lt", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const launchIdx = src.search(/Run launched/);
  assert.ok(launchIdx >= 0, "expected 'Run launched' breadcrumb header");
  const region = src.slice(launchIdx, launchIdx + 800);
  assert.doesNotMatch(region, /pgrep/);
  assert.doesNotMatch(region, /ls -lt/);
});
