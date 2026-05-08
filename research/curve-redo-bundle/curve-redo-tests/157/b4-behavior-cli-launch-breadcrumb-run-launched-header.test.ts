// Verifies the issue's proposed launch-time breadcrumb header is present
// in src/cli.ts so a fresh operator (human or LLM) sees a discoverable
// hand-off label after `vp-dev run --confirm`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts emits a 'Run launched' breadcrumb header", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /Run launched/);
});
