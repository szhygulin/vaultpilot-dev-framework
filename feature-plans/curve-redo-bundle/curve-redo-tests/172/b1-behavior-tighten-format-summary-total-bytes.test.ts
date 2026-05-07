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

test("formatTightenProposal: top-level summary references total source bytes", () => {
  const md = fakeMd([
    { run: "run-1", issue: 137, heading: "A", body: "Some original prose body for the first section here." },
    { run: "run-2", issue: 138, heading: "B", body: "Another original prose body for the second section here." },
  ]);
  const sections = parseClaudeMdSections(md);
  const proposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [
      { sectionId: "s0", rewrittenBody: "Short A.", estimatedBytesSaved: 40 },
      { sectionId: "s1", rewrittenBody: "Short B.", estimatedBytesSaved: 40 },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 80,
    warnings: [],
  };
  const out = formatTightenProposal(proposal, sections);
  // Summary block should reference total bytes — at minimum, the word "total" appears.
  assert.match(out, /total/i);
  assert.match(out, /bytes/);
});
