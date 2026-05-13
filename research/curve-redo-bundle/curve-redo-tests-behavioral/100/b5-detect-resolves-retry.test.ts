// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeFailurePostMortem, detectPendingPostMortem, POST_MORTEM_SENTINEL } from "./failurePostMortem.js";

test("b5 detect resolves retry", () => {
  const r = detectPendingPostMortem([{ author: "v", body: "## vp-dev failure post-mortem (run-A, agent-1)\nfailed", createdAt: "2026-05-05T10:00:00Z" }, { author: "alice", body: "retry — split", createdAt: "2026-05-05T11:00:00Z" }]);
  assert.equal(r.pending, false);
});
