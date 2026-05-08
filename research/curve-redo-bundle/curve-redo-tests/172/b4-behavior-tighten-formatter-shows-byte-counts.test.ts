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

test("formatTightenProposal: shows source bytes and rewrite bytes", () => {
  const sourceBody = "x".repeat(120);
  const rewriteBody = "y".repeat(80);
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
        estimatedBytesSaved: 40,
      },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 40,
    warnings: [],
  };
  const out = formatTightenProposal(proposal as any, sections);
  assert.match(out, /\b120\b/, "expected source byte count to appear");
  assert.match(out, /\b80\b/, "expected rewrite byte count to appear");
});
