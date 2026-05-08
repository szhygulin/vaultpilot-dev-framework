import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTightenProposal, type TightenProposal } from "./tightenClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

function fakeMd(sections: Array<{ run: string; issue: number; heading: string; body: string }>): string {
  return sections
    .map(
      (s) =>
        `<!-- run:${s.run} issue:#${s.issue} outcome:implement ts:2026-05-05T12:00:00.000Z -->\n## ${s.heading}\n\n${s.body}\n`,
    )
    .join("\n");
}

test("formatTightenProposal: summary shows clean and flagged counts", () => {
  const md = fakeMd([
    { run: "run-1", issue: 137, heading: "A", body: "A long body for tightening." },
    { run: "run-2", issue: 138, heading: "B", body: "Another long body for tightening." },
  ]);
  const sections = parseClaudeMdSections(md);
  const proposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [
      { sectionId: "s0", rewrittenBody: "A.", estimatedBytesSaved: 25 },
      { sectionId: "s1", rewrittenBody: "B.", estimatedBytesSaved: 30 },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 55,
    warnings: [],
  };
  const out = formatTightenProposal(proposal, sections);
  assert.match(out, /clean/i);
});
