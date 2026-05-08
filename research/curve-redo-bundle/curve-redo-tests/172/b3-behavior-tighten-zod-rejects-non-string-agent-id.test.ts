import { test } from "node:test";
import assert from "node:assert/strict";
import { TightenProposalSchema } from "./tightenClaudeMd.js";

test("TightenProposalSchema rejects non-string agentId", () => {
  const result = TightenProposalSchema.safeParse({
    agentId: 12345,
    rewrites: [],
    unchangedSectionIds: [],
    estimatedBytesSaved: 0,
    warnings: [],
  });
  assert.equal(result.success, false);
});
