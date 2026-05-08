import { test } from "node:test";
import assert from "node:assert/strict";
import { TightenProposalSchema } from "./tightenClaudeMd.js";

test("TightenProposalSchema rejects proposal missing agentId", () => {
  const result = TightenProposalSchema.safeParse({
    rewrites: [],
    unchangedSectionIds: [],
    estimatedBytesSaved: 0,
    warnings: [],
  });
  assert.equal(result.success, false);
});
