// The issue body proposes annotating --watch with 'live tail' or
// 're-renders on interval' so the operator knows what they're getting.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts breadcrumb describes --watch as a live/tailing mode", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /live tail|re-?renders|interval/i);
});
