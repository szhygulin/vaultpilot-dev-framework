import { test } from "node:test";
import assert from "node:assert/strict";
import { findTightenWarnings, type TightenProposal } from "./tightenClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

function fakeMd(sections: Array<{ run: string; issue: number; heading: string; body: string }>): string {
  return sections
    .map(
      (s) =>
        `<!-- run:${s.run} issue:#${s.issue} outcome:implement ts:2026-05-05T12:00:00.000Z -->\n## ${s.heading}\n\n${s.body}\n`,
    )
    .join("\n");
}

test("findTightenWarnings: rewrite preserves single 5KB threshold -> no warnings", () => {
  const md = fakeMd([{ run: "run-A", issue: 100, heading: "Rule A", body: "Cap output at 5KB before summarizing the rest." }]);
  const sections = parseClaudeMdSections(md);
  const proposal: TightenProposal = {
    agentId: "agent-x",
    rewrites: [{ sectionId: "s0", rewrittenBody: "Cap at 5KB.", estimatedBytesSaved: 30 }],
    unchangedSectionIds: [],
    estimatedBytesSaved: 30,
    warnings: [],
  };
  const warnings = findTightenWarnings(proposal, sections);
  assert.equal(warnings.length, 0);
});
