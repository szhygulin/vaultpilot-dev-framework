import { test } from "node:test";
import assert from "node:assert/strict";

test("ensureOriginRemote is importable from worktree.js", async () => {
  const mod: any = await import("./worktree.js");
  assert.equal(typeof mod.ensureOriginRemote, "function");
});
