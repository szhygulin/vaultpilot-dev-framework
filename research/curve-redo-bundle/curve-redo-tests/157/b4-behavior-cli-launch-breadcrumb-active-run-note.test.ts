// The proposed breadcrumb annotates `vp-dev status` (no args) with a
// note that it targets the active run -- the whole point of the bug.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts breadcrumb describes vp-dev status as targeting the active run", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /active run/i);
});
