// pendingIssueIds untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 pending preserved", () => {
  const src = readFileSync(resolve(process.cwd(), "src/state/runState.ts"), "utf8");
  assert.match(src, /pendingIssueIds[\s\S]*?["']pending["']/);
});
