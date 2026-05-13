// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeFailurePostMortem, detectPendingPostMortem, POST_MORTEM_SENTINEL } from "./failurePostMortem.js";

test("b5 compose sentinel matches", () => {
  const body = composeFailurePostMortem({ runId: "r", agentId: "a" });
  assert.ok(POST_MORTEM_SENTINEL.test(body.split("\n")[0]));
});
