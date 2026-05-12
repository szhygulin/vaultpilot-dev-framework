// POST_MORTEM_SENTINEL exported.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 pm sentinel exported", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/failurePostMortem.ts"), "utf8");
  assert.match(src, /export\s+const\s+POST_MORTEM_SENTINEL/);
});
