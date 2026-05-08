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

test("formatTightenProposal: renders 'Validator: clean' for sections with no warnings", () => {
  const md = fakeMd([
    { run: "run-A", issue: 100, heading: "Rule A", body: "Long body of original content that is being tightened." },
  ]);
  const sections = parseClaudeMdSections(md);
  const proposal = {
    agentId: "agent-test",
    rewrites: [
      {
        sectionId: sections[0].id,
        rewrittenBody: "Tightened body of original content.",
        estimatedBytesSaved: 20,
      },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 20,
    warnings: [],
  };
  const out = formatTightenProposal(proposal as any, sections);
  assert.match(out, /Validator:\s*clean/i);
});
