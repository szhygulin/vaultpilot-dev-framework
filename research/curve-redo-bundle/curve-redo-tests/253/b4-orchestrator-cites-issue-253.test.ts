import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("orchestrator.ts cites issue #253 in a comment", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/orchestrator.ts"), "utf8");
  assert.match(src, /#253/);
});
