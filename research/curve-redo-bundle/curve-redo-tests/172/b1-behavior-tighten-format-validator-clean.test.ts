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

test("formatTightenProposal: clean rewrite gets 'Validator: clean' line", () => {
  const md = fakeMd([
    { run: "run-1", issue: 137, heading: "H", body: "Past incident 2026-05-05: a long body to tighten." },
  ]);
  const sections = parseClaudeMdSections(md);
  const proposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [
      {
        sectionId: "s0",
        rewrittenBody: "Past incident 2026-05-05: short body.",
        estimatedBytesSaved: 20,
      },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 20,
    warnings: [],
  };
  const out = formatTightenProposal(proposal, sections);
  assert.match(out, /Validator:\s*clean/);
});
