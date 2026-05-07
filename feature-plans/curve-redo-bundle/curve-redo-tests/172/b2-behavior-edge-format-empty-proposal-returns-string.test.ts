import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTightenProposal, type TightenProposal } from "./tightenClaudeMd.js";

test("formatTightenProposal: empty proposal returns a non-empty string", () => {
  const proposal: TightenProposal = {
    agentId: "agent-empty",
    rewrites: [],
    unchangedSectionIds: [],
    estimatedBytesSaved: 0,
    warnings: [],
  };
  const out = formatTightenProposal(proposal, []);
  assert.equal(typeof out, "string");
  assert.ok(out.length > 0);
});
