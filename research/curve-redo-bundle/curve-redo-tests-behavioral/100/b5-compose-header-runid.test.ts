// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeFailurePostMortem, detectPendingPostMortem, POST_MORTEM_SENTINEL } from "./failurePostMortem.js";

test("b5 compose header runid", () => {
  const body = composeFailurePostMortem({ runId: "run-X", agentId: "agent-Y" });
  assert.match(body.split("\n")[0], /run-X/);
});
