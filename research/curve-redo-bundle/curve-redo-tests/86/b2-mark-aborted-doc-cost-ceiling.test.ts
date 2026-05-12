// Doc mentions cost-ceiling.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 mark aborted doc cost ceiling", () => {
  const src = readFileSync(resolve(process.cwd(), "src/state/runState.ts"), "utf8");
  assert.match(src, /cost ceiling|cost-ceiling/i);
});
