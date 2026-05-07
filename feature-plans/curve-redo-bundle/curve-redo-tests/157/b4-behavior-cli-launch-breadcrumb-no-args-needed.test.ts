// The issue's labeling suggests 'no args needed' annotation so the
// operator doesn't search for a runId positional after seeing the hint.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts breadcrumb notes that vp-dev status needs no args", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  // Accept several phrasings: 'no args', 'no arguments', 'active run, no args needed'.
  assert.match(src, /no args|no arguments|active run/i);
});
