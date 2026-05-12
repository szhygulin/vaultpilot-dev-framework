// The restore call must live inside a finally block so it runs on the
// crash path too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("runIssueCore.ts calls restoreOriginRemote inside a finally block", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/runIssueCore.ts"), "utf8");
  const restoreIdx = src.indexOf("restoreOriginRemote(");
  assert.ok(restoreIdx > 0, "restoreOriginRemote call site missing");
  // search backward for `finally {`
  const window = src.slice(Math.max(0, restoreIdx - 2000), restoreIdx);
  assert.match(window, /finally\s*\{/);
});
