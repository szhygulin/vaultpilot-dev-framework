// The proposal explicitly states 'no args needed' so the operator does not
// reach for `vp-dev status <runId>` (which the issue notes was the third
// failed attempt). Test that 'no args' appears near 'Check progress'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: 'Check progress' breadcrumb mentions 'no args' so the canonical path is unambiguous", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /Check progress[\s\S]{0,200}no args/);
});
