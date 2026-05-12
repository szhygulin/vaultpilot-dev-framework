// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeFailurePostMortem, detectPendingPostMortem, POST_MORTEM_SENTINEL } from "./failurePostMortem.js";

test("b5 detect reason cites runid", () => {
  const r = detectPendingPostMortem([{ author: "v", body: "## vp-dev failure post-mortem (run-2026-05-05, agent-1)", createdAt: "2026-05-05T10:00:00Z" }]);
  assert.ok(r.reason && r.reason.includes("run-2026-05-05"));
});
