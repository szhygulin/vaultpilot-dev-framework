// The 'Check progress' label must appear close to the canonical command
// 'vp-dev status' -- otherwise the breadcrumb is decoration without action.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: 'Check progress' label is paired with 'vp-dev status' command", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /Check progress[\s\S]{0,200}vp-dev status/);
});
