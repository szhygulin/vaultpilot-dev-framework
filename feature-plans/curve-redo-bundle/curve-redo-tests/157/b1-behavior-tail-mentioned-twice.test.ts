// Both --confirm and --plan paths get the breadcrumb, so the 'live tail'
// phrasing should appear at least twice (the confirm label + the plan inline
// hint comment).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: 'live tail' phrase appears in both confirm and plan breadcrumbs", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const matches = src.match(/[Ll]ive tail/g) || [];
  assert.ok(
    matches.length >= 2,
    `expected >=2 'live tail' mentions across confirm+plan paths, got ${matches.length}`,
  );
});
