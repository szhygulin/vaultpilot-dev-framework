// 'Check progress' label is the canonical breadcrumb line introduced by the
// fix. It points operators at `vp-dev status` instead of pgrep/ls forensics.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: cli.ts breadcrumb includes a 'Check progress' label", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /Check progress/);
});
