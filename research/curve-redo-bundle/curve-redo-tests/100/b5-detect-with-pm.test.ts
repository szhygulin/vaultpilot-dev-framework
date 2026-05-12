// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeFailurePostMortem, detectPendingPostMortem, POST_MORTEM_SENTINEL } from "./failurePostMortem.js";

test("b5 detect with pm", () => {
  const r = detectPendingPostMortem([{ author: "vp-dev", body: "## vp-dev failure post-mortem (run-X, agent-Y)\n\nx", createdAt: "2026-05-05T10:00:00Z" }]);
  assert.equal(r.pending, true);
});
