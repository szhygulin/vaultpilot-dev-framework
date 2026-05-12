// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeFailurePostMortem, detectPendingPostMortem, POST_MORTEM_SENTINEL } from "./failurePostMortem.js";

test("b5 detect anchored sentinel", () => {
  const r = detectPendingPostMortem([{ author: "u", body: "I saw the bot write '## vp-dev failure post-mortem' last week.", createdAt: "2026-05-05T10:00:00Z" }]);
  assert.equal(r.pending, false);
});
