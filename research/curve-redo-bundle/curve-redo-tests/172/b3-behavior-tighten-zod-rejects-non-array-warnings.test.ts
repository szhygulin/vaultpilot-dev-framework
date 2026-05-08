import { test } from "node:test";
import assert from "node:assert/strict";
import { TightenProposalSchema } from "./tightenClaudeMd.js";

test("TightenProposalSchema rejects non-array warnings", () => {
  const result = TightenProposalSchema.safeParse({
    agentId: "agent-916a",
    rewrites: [],
    unchangedSectionIds: [],
    estimatedBytesSaved: 0,
    warnings: "none",
  });
  assert.equal(result.success, false);
});
