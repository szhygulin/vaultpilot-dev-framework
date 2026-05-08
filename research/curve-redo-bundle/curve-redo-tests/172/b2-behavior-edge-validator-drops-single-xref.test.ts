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

test("findTightenWarnings: dropping the only issue xref yields >=1 warning", () => {
  const md = fakeMd([{ run: "run-A", issue: 100, heading: "Rule A", body: "This rule descends from issue #137 and its precedents." }]);
  const sections = parseClaudeMdSections(md);
  const proposal: TightenProposal = {
    agentId: "agent-x",
    rewrites: [{ sectionId: "s0", rewrittenBody: "This rule descends from earlier work.", estimatedBytesSaved: 30 }],
    unchangedSectionIds: [],
    estimatedBytesSaved: 30,
    warnings: [],
  };
  const warnings = findTightenWarnings(proposal, sections);
  assert.ok(warnings.length >= 1, "expected at least one warning when sole xref is dropped");
});
