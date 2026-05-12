// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeFailurePostMortem, detectPendingPostMortem, POST_MORTEM_SENTINEL } from "./failurePostMortem.js";

test("b5 detect mid paragraph", () => {
  const r = detectPendingPostMortem([{ author: "v", body: "Heads up:\n\n## vp-dev failure post-mortem (run-X, agent-1)\n\n- error", createdAt: "2026-05-05T10:00:00Z" }]);
  assert.equal(r.pending, true);
});
