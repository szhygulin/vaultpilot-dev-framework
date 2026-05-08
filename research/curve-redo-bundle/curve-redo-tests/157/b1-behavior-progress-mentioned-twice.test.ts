// Both --confirm and --plan paths get the breadcrumb, so the 'check
// progress' phrasing should appear at least twice (case-insensitive: confirm
// uses the capitalised label, plan uses the lowercase imperative).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: 'check progress' phrase appears in both confirm and plan breadcrumbs", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const matches = src.match(/[Cc]heck progress/g) || [];
  assert.ok(
    matches.length >= 2,
    `expected >=2 'check progress' mentions across confirm+plan paths, got ${matches.length}`,
  );
});
