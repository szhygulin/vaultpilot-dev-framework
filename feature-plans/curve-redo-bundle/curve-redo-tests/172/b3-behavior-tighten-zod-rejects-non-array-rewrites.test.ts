import { test } from "node:test";
import assert from "node:assert/strict";
import { TightenProposalSchema } from "./tightenClaudeMd.js";

test("TightenProposalSchema rejects non-array rewrites", () => {
  const result = TightenProposalSchema.safeParse({
    agentId: "agent-916a",
    rewrites: "not an array",
    unchangedSectionIds: [],
    estimatedBytesSaved: 0,
    warnings: [],
  });
  assert.equal(result.success, false);
});
