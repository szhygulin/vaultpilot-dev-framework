// Restore must happen BEFORE the worktree teardown (otherwise the
// worktreePath is gone).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("runIssueCore.ts restore call appears before removeWorktree", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/runIssueCore.ts"), "utf8");
  const restoreIdx = src.indexOf("restoreOriginRemote(");
  const removeIdx = src.indexOf("removeWorktree(");
  if (restoreIdx > 0 && removeIdx > 0) {
    assert.ok(restoreIdx < removeIdx, "restore must precede removeWorktree");
  }
});
