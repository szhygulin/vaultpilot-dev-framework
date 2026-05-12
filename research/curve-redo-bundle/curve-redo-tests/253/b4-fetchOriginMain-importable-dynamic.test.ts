import { test } from "node:test";
import assert from "node:assert/strict";

test("fetchOriginMain still exported (no breakage)", async () => {
  const mod: any = await import("./worktree.js");
  assert.equal(typeof mod.fetchOriginMain, "function");
});
