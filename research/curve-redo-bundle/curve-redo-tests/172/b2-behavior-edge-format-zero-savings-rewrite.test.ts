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

test("formatTightenProposal: zero-savings rewrite still produces a string output", () => {
  const md = fakeMd([{ run: "run-A", issue: 100, heading: "Rule A", body: "Same body content." }]);
  const sections = parseClaudeMdSections(md);
  const proposal: TightenProposal = {
    agentId: "agent-x",
    rewrites: [{ sectionId: "s0", rewrittenBody: "Same body content.", estimatedBytesSaved: 0 }],
    unchangedSectionIds: [],
    estimatedBytesSaved: 0,
    warnings: [],
  };
  const out = formatTightenProposal(proposal, sections);
  assert.equal(typeof out, "string");
  assert.ok(out.length > 0);
});
