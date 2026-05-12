// markAborted takes (state, issueId).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 mark aborted takes state id", () => {
  const src = readFileSync(resolve(process.cwd(), "src/state/runState.ts"), "utf8");
  assert.match(src, /markAborted\s*\(\s*state\s*:\s*RunState\s*,\s*issueId\s*:\s*number\s*\)/);
});
