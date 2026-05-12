// Triage imports detect.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 triage imports detect", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/triage.ts"), "utf8");
  assert.match(src, /detectPendingPostMortem/);
});
