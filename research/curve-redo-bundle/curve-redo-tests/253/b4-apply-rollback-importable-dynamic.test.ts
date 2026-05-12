import { test } from "node:test";
import assert from "node:assert/strict";

test("applyReplayRollback is still callable (dynamic import)", async () => {
  const mod: any = await import("./replay.js");
  assert.equal(typeof mod.applyReplayRollback, "function");
});
