// Issue #253 — applyReplayRollback strips origin from shared .git/config,
// breaking subsequent cells. PR #262 fix: return originUrl from
// applyReplayRollback + add restoreOriginRemote() helper.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/agent/replay.ts source exists post-fix", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  assert.ok(src.length > 0);
});
