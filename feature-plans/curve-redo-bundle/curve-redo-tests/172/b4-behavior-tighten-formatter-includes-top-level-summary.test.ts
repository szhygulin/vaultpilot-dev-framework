import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTightenProposal } from "./tightenClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

function fakeMd(sections: Array<{ run: string; issue: number; heading: string; body: string }>): string {
  return sections
    .map(
      (s) =>
        `<!-- run:${s.run} issue:#${s.issue} outcome:implement ts:2026-05-05T12:00:00.000Z -->\n## ${s.heading}\n\n${s.body}\n`,
    )
    .join("\n");
}

test("formatTightenProposal: top-level summary mentions totals (bytes saved or section counts)", () => {
  const md = fakeMd([
    { run: "run-A", issue: 100, heading: "Rule A", body: "Long original body content that we will tighten in the dry run." },
    { run: "run-B", issue: 101, heading: "Rule B", body: "Another long original body content with more material to tighten." },
  ]);
  const sections = parseClaudeMdSections(md);
  const proposal = {
    agentId: "agent-916a",
    rewrites: [
      {
        sectionId: sections[0].id,
        rewrittenBody: "Tightened A.",
        estimatedBytesSaved: 50,
      },
      {
        sectionId: sections[1].id,
        rewrittenBody: "Tightened B.",
        estimatedBytesSaved: 55,
      },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 105,
    warnings: [],
  };
  const out = formatTightenProposal(proposal as any, sections);
  assert.match(out, /\b105\b/, "expected total bytes-saved (105) to appear in summary");
});
