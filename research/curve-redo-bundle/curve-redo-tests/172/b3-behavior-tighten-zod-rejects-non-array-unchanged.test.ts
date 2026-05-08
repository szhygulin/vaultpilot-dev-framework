import { test } from "node:test";
import assert from "node:assert/strict";
import { TightenProposalSchema } from "./tightenClaudeMd.js";

test("TightenProposalSchema rejects non-array unchangedSectionIds", () => {
  const result = TightenProposalSchema.safeParse({
    agentId: "agent-916a",
    rewrites: [],
    unchangedSectionIds: { s0: true },
    estimatedBytesSaved: 0,
    warnings: [],
  });
  assert.equal(result.success, false);
});
