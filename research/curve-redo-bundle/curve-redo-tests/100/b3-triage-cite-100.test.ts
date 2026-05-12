// Triage cites #100.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 triage cite 100", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/triage.ts"), "utf8");
  assert.match(src, /#100|issue 100/);
});
