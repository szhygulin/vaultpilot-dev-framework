// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeFailurePostMortem, detectPendingPostMortem, POST_MORTEM_SENTINEL } from "./failurePostMortem.js";

test("b5 detect no pm", () => {
  const r = detectPendingPostMortem([{ author: "u", body: "Looks good!", createdAt: "2026-05-04T10:00:00Z" }]);
  assert.equal(r.pending, false);
});
