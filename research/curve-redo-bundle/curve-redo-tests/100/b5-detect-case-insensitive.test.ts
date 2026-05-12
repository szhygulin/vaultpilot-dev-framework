// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeFailurePostMortem, detectPendingPostMortem, POST_MORTEM_SENTINEL } from "./failurePostMortem.js";

test("b5 detect case insensitive", () => {
  const r = detectPendingPostMortem([{ author: "u", body: "## VP-DEV FAILURE POST-MORTEM (run-X, agent-Y)", createdAt: "2026-05-05T10:00:00Z" }]);
  assert.equal(r.pending, true);
});
