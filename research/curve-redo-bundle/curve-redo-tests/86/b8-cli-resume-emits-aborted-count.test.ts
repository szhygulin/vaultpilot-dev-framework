// Resume emits abortedBudgetCount.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b8 cli resume emits aborted count", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /runResume[\s\S]*?abortedBudgetCount/);
});
