// Pin the exact suggested invocation `vp-dev status --watch`. Without
// this, the breadcrumb wouldn't surface the watch sub-mode.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts mentions `vp-dev status --watch` in the breadcrumb", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /vp-dev status --watch/);
});
