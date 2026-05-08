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

test("formatTightenProposal: per-section block references the source section id", () => {
  const md = fakeMd([
    { run: "run-A", issue: 137, heading: "Issue 137 lesson", body: "Long original body that contains 100 chars of guidance to be tightened by half." },
  ]);
  const sections = parseClaudeMdSections(md);
  const proposal = {
    agentId: "agent-916a",
    rewrites: [
      {
        sectionId: sections[0].id,
        rewrittenBody: "Tightened guidance — 100 chars retained.",
        estimatedBytesSaved: 40,
      },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 40,
    warnings: [],
  };
  const out = formatTightenProposal(proposal as any, sections);
  assert.match(out, new RegExp(`\\[?${sections[0].id}\\]?`));
});
