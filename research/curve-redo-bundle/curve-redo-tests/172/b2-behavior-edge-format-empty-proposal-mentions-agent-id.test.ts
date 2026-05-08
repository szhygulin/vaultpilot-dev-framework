import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTightenProposal, type TightenProposal } from "./tightenClaudeMd.js";

test("formatTightenProposal: empty proposal still names the agentId", () => {
  const proposal: TightenProposal = {
    agentId: "agent-916a-unique-tag",
    rewrites: [],
    unchangedSectionIds: [],
    estimatedBytesSaved: 0,
    warnings: [],
  };
  const out = formatTightenProposal(proposal, []);
  assert.match(out, /agent-916a-unique-tag/);
});
