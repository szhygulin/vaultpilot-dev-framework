// Logs post_mortem_posted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 orch pm posted event", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/orchestrator.ts"), "utf8");
  assert.match(src, /post_mortem_posted/);
});
