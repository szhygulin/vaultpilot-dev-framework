import { test } from "node:test";
import assert from "node:assert/strict";

test("applyReplayRollback retains its options-object signature", async () => {
  const mod: any = await import("./replay.js");
  assert.equal(typeof mod.applyReplayRollback, "function");
  // It takes options object — function arity will be 1.
  assert.equal(mod.applyReplayRollback.length, 1);
});
