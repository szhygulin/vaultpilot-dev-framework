// The breadcrumb is one cohesive block; the status command suggestion
// should be in the immediate vicinity of the 'Run launched' header,
// not split across distant branches.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts: 'vp-dev status' mention sits within ~600 chars of 'Run launched'", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const launchIdx = src.search(/Run launched/);
  assert.ok(launchIdx >= 0, "expected 'Run launched' header in src/cli.ts");
  const region = src.slice(launchIdx, launchIdx + 600);
  assert.match(region, /vp-dev status/);
});
