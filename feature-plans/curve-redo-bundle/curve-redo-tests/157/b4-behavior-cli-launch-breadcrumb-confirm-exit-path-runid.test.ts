// The issue uses '<ts>' as a placeholder, but the implementation should
// interpolate an actual runId expression in src/cli.ts (template
// literal, concatenation, or printf-style). We accept any reasonable
// interpolation marker, but reject the literal placeholder '<ts>'.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts launch breadcrumb interpolates the runId rather than printing '<ts>'", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const launchIdx = src.search(/Run launched/);
  assert.ok(launchIdx >= 0, "expected 'Run launched' breadcrumb header");
  const region = src.slice(launchIdx, launchIdx + 600);
  // Region should reference a runId identifier, not the literal '<ts>' from the issue body.
  assert.match(region, /runId/);
  assert.doesNotMatch(region, /<ts>/);
});
