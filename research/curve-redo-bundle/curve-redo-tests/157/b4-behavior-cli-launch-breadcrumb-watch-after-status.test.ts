// Order: the no-args 'Check progress' line should come before the
// 'Live tail' --watch line. That mirrors the proposed wording exactly
// and matches the priority (no-args is the canonical default).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("in the launch breadcrumb, 'Check progress' precedes 'Live tail'", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const checkIdx = src.search(/Check progress/i);
  const liveIdx = src.search(/Live tail/i);
  assert.ok(checkIdx >= 0, "expected 'Check progress' label");
  assert.ok(liveIdx >= 0, "expected 'Live tail' label");
  assert.ok(checkIdx < liveIdx, "'Check progress' should appear before 'Live tail'");
});
