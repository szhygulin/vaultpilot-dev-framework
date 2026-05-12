// fix landed keyword present.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 kw fix landed", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/failurePostMortem.ts"), "utf8");
  assert.match(src, /["']fix landed["']/);
});
