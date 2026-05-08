// The 'Run launched' header and the 'Live tail' label belong to the same
// confirm-path breadcrumb block; they should be near each other.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: confirm-path 'Run launched' header is co-located with 'Live tail'", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /Run launched[\s\S]{0,500}Live tail/);
});
