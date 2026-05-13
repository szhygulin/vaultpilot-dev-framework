// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeFailurePostMortem, detectPendingPostMortem, POST_MORTEM_SENTINEL } from "./failurePostMortem.js";

test("b5 compose cost duration", () => {
  const body = composeFailurePostMortem({ runId: "r", agentId: "a", costUsd: 4.51, durationMs: 7 * 60_000 });
  assert.match(body, /\$4\.51/);
  assert.match(body, /7\.0 min/);
});
