import { test } from "node:test";
import assert from "node:assert/strict";
import type { TightenProposal } from "./tightenClaudeMd.js";

test("TightenProposal: empty proposal carries agentId, rewrites, unchangedSectionIds, totals, warnings", () => {
  const proposal: TightenProposal = {
    agentId: "agent-empty",
    rewrites: [],
    unchangedSectionIds: [],
    estimatedBytesSaved: 0,
    warnings: [],
  };
  assert.equal(proposal.agentId, "agent-empty");
  assert.deepEqual(proposal.rewrites, []);
  assert.deepEqual(proposal.unchangedSectionIds, []);
  assert.equal(proposal.estimatedBytesSaved, 0);
  assert.deepEqual(proposal.warnings, []);
});
