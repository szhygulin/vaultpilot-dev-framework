// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeFailurePostMortem, detectPendingPostMortem, POST_MORTEM_SENTINEL } from "./failurePostMortem.js";

test("b5 compose error reason fallback", () => {
  const body = composeFailurePostMortem({ runId: "r", agentId: "a", errorReason: "broken pipe" });
  assert.match(body, /broken pipe/);
});
