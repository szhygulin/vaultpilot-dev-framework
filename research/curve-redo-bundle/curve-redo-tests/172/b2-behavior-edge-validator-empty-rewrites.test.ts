import { test } from "node:test";
import assert from "node:assert/strict";
import { findTightenWarnings, type TightenProposal } from "./tightenClaudeMd.js";

test("findTightenWarnings: empty rewrites array yields no warnings", () => {
  const proposal: TightenProposal = {
    agentId: "agent-x",
    rewrites: [],
    unchangedSectionIds: ["s0"],
    estimatedBytesSaved: 0,
    warnings: [],
  };
  const warnings = findTightenWarnings(proposal, []);
  assert.equal(warnings.length, 0);
});
