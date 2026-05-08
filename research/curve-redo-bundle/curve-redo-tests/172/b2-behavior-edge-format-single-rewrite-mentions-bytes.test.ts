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

test("formatTightenProposal: per-section block includes 'bytes' accounting text", () => {
  const md = fakeMd([{ run: "run-A", issue: 100, heading: "Rule A", body: "Some body text." }]);
  const sections = parseClaudeMdSections(md);
  const proposal: TightenProposal = {
    agentId: "agent-x",
    rewrites: [{ sectionId: "s0", rewrittenBody: "Tight.", estimatedBytesSaved: 10 }],
    unchangedSectionIds: [],
    estimatedBytesSaved: 10,
    warnings: [],
  };
  const out = formatTightenProposal(proposal, sections);
  assert.match(out, /bytes/);
});
