// Other exports from the module (captureWorktreeDiff, readWorktreeHead)
// must remain.
import { test } from "node:test";
import assert from "node:assert/strict";

test("replay.js still exports captureWorktreeDiff and readWorktreeHead", async () => {
  const mod: any = await import("./replay.js");
  assert.equal(typeof mod.captureWorktreeDiff, "function");
  assert.equal(typeof mod.readWorktreeHead, "function");
});
