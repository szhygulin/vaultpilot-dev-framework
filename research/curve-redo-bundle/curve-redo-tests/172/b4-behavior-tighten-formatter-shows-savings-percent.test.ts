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

test("formatTightenProposal: includes a percent sign and savings number", () => {
  const sourceBody = "a".repeat(100);
  const rewriteBody = "a".repeat(75);
  const md = fakeMd([
    { run: "run-A", issue: 100, heading: "Rule A", body: sourceBody },
  ]);
  const sections = parseClaudeMdSections(md);
  const proposal = {
    agentId: "agent-test",
    rewrites: [
      {
        sectionId: sections[0].id,
        rewrittenBody: rewriteBody,
        estimatedBytesSaved: 25,
      },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 25,
    warnings: [],
  };
  const out = formatTightenProposal(proposal as any, sections);
  assert.match(out, /%/, "expected '%' to appear in output");
  assert.match(out, /(savings|saved)/i, "expected savings indication");
});
