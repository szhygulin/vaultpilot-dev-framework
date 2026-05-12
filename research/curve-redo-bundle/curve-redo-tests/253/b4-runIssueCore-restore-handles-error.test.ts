import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("runIssueCore.ts wraps restore call in try/catch to log non-fatally", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/runIssueCore.ts"), "utf8");
  const restoreIdx = src.indexOf("restoreOriginRemote(");
  assert.ok(restoreIdx > 0);
  const window = src.slice(Math.max(0, restoreIdx - 200), restoreIdx + 400);
  assert.match(window, /try\s*\{|catch/);
});
