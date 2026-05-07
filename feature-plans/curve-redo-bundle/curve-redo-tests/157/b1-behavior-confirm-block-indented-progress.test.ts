// The proposed format uses a two-space indent before each label so the
// breadcrumb renders as a block. Verify 'Check progress:' has leading
// whitespace.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: 'Check progress:' is rendered as an indented breadcrumb line", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /[ \t]+Check progress:/);
});
