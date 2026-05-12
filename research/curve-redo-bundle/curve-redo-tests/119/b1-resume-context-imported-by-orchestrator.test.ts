// src/orchestrator/orchestrator.ts imports ResumeContext.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 resume context imported by orchestrator", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/orchestrator.ts"), "utf8");
  assert.match(src, /ResumeContext/);
});
