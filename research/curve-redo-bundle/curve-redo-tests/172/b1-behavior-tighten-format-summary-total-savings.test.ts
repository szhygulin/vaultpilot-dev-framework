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

test("formatTightenProposal: top-level summary references total savings", () => {
  const md = fakeMd([
    { run: "run-1", issue: 137, heading: "A", body: "Original prose body for tightening here." },
  ]);
  const sections = parseClaudeMdSections(md);
  const proposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [{ sectionId: "s0", rewrittenBody: "Tight.", estimatedBytesSaved: 33 }],
    unchangedSectionIds: [],
    estimatedBytesSaved: 33,
    warnings: [],
  };
  const out = formatTightenProposal(proposal, sections);
  assert.match(out, /sav(ed|ings)/i);
});
