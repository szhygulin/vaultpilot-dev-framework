// The 'Run launched' header and the 'Check progress' label belong to the
// same confirm-path breadcrumb block; they should be near each other in
// src/cli.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: confirm-path 'Run launched' header is co-located with 'Check progress'", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /Run launched[\s\S]{0,500}Check progress/);
});
