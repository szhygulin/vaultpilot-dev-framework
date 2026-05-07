// 'Live tail' label introduces the --watch affordance in the confirm-path
// breadcrumb the fix adds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: cli.ts breadcrumb includes a 'Live tail' label", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /Live tail/);
});
