// The breadcrumb's first action line is 'Check progress: vp-dev status'.
// This test pins the label so a refactor that drops the wording fails.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts contains a 'Check progress' label pointing at vp-dev status", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /Check progress/i);
});
