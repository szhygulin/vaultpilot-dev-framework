// Doc says Parallel to markFailed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 mark aborted parallel markfailed", () => {
  const src = readFileSync(resolve(process.cwd(), "src/state/runState.ts"), "utf8");
  assert.match(src, /Parallel to .?markFailed|parallel to.+markFailed/i);
});
