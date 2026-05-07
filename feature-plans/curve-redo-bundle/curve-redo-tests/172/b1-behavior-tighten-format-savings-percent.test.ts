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

test("formatTightenProposal: per-section block reports savings percentage with %", () => {
  const md = fakeMd([
    { run: "run-1", issue: 137, heading: "H", body: "A long original body that becomes much shorter after tightening." },
  ]);
  const sections = parseClaudeMdSections(md);
  const proposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [{ sectionId: "s0", rewrittenBody: "Short body.", estimatedBytesSaved: 50 }],
    unchangedSectionIds: [],
    estimatedBytesSaved: 50,
    warnings: [],
  };
  const out = formatTightenProposal(proposal, sections);
  assert.match(out, /\d+(\.\d+)?\s*%/);
});
