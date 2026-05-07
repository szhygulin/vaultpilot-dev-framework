// The new status hint must NOT replace the existing --confirm token
// hint -- it follows it. This guards against accidental deletion.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts plan output still mentions `vp-dev run --confirm` alongside the new status hint", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /vp-dev run --confirm/);
  assert.match(src, /After launch/i);
  assert.match(src, /vp-dev status/);
});
