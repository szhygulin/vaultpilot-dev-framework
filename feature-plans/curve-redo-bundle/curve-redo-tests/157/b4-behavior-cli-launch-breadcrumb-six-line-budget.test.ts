// Budget: '~6 lines of output, prints once per run'. Pin the size so a
// later refactor can't balloon the breadcrumb past its design budget.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts 'Run launched' breadcrumb stays under a generous 20-line ceiling", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const launchIdx = src.search(/Run launched/);
  assert.ok(launchIdx >= 0, "expected 'Run launched' breadcrumb header");
  // Take a window from the header to the next clear separator (blank
  // line or closing of the surrounding string literal/template).
  const window = src.slice(launchIdx, launchIdx + 800);
  // Count '\n' occurrences before the first long gap. A coarse bound:
  // the breadcrumb-shaped chunk should be < 20 newlines.
  const breakIdx = window.search(/\n[^\S\n]*\n/); // a blank line
  const chunk = breakIdx >= 0 ? window.slice(0, breakIdx) : window.slice(0, 400);
  const lineCount = chunk.split(/\n/).length;
  assert.ok(lineCount <= 20, `breadcrumb chunk grew to ${lineCount} lines, expected <= 20`);
});
