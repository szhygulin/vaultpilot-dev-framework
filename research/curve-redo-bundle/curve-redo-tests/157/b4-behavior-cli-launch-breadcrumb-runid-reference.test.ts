// The proposed breadcrumb has a `runId: <ts>` line so callers don't
// have to read state/ or logs/ filenames to learn the runId.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts launch breadcrumb references the runId", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  // 'Run launched' header should be reasonably near a runId mention.
  const launchIdx = src.search(/Run launched/);
  assert.ok(launchIdx >= 0, "expected 'Run launched' header in src/cli.ts");
  const window = src.slice(launchIdx, launchIdx + 600);
  assert.match(window, /runId/i);
});
