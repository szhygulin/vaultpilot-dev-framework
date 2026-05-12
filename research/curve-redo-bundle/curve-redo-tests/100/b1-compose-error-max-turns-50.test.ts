// Mentions 50-turn budget.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 compose error max turns 50", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/failurePostMortem.ts"), "utf8");
  assert.match(src, /error_max_turns[\s\S]*?50-turn|50-turn[\s\S]*?error_max_turns/);
});
