// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeFailurePostMortem, detectPendingPostMortem, POST_MORTEM_SENTINEL } from "./failurePostMortem.js";

test("b5 compose partial branch", () => {
  const body = composeFailurePostMortem({ runId: "r", agentId: "a", partialBranchUrl: "https://github.com/x/y/tree/foo" });
  assert.match(body, /Partial branch/);
});
