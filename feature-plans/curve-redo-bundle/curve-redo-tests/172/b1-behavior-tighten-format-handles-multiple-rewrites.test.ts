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

test("formatTightenProposal: emits a per-section block for every rewrite", () => {
  const md = fakeMd([
    { run: "run-1", issue: 100, heading: "A", body: "First long body for tightening here." },
    { run: "run-2", issue: 101, heading: "B", body: "Second long body for tightening here." },
    { run: "run-3", issue: 102, heading: "C", body: "Third long body for tightening here." },
  ]);
  const sections = parseClaudeMdSections(md);
  const proposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [
      { sectionId: "s0", rewrittenBody: "A.", estimatedBytesSaved: 30 },
      { sectionId: "s1", rewrittenBody: "B.", estimatedBytesSaved: 30 },
      { sectionId: "s2", rewrittenBody: "C.", estimatedBytesSaved: 30 },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 90,
    warnings: [],
  };
  const out = formatTightenProposal(proposal, sections);
  assert.match(out, /\[s0\]/);
  assert.match(out, /\[s1\]/);
  assert.match(out, /\[s2\]/);
});
