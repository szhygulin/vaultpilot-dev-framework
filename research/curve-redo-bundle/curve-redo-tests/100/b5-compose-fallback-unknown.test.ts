// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeFailurePostMortem, detectPendingPostMortem, POST_MORTEM_SENTINEL } from "./failurePostMortem.js";

test("b5 compose fallback unknown", () => {
  const body = composeFailurePostMortem({ runId: "r", agentId: "a" });
  assert.match(body, /unknown/);
});
