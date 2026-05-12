import { test } from "node:test";
import assert from "node:assert/strict";

test("restoreOriginRemote is callable (dynamic import)", async () => {
  const mod: any = await import("./replay.js");
  // Just smoke: undefined originUrl => no-op (resolves), no throw.
  await mod.restoreOriginRemote({ worktreePath: process.cwd(), originUrl: undefined });
  assert.ok(true);
});
