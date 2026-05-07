import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findRewriteWarnings,
  formatTightenProposal,
  type TightenProposal,
} from "./tightenClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

function fakeMd(sections: Array<{ run: string; issue: number; heading: string; body: string }>): string {
  return sections
    .map(
      (s) =>
        `<!-- run:${s.run} issue:#${s.issue} outcome:implement ts:2026-05-05T12:00:00.000Z -->\n## ${s.heading}\n\n${s.body}\n`,
    )
    .join("\n");
}

test("end-to-end: rich rewrite (date+xref+numeric preserved) yields no warnings and clean format", () => {
  const md = fakeMd([
    {
      run: "run-1",
      issue: 137,
      heading: "Rich rule",
      body: "Past incident 2026-05-05: see issue #200 about the 50KB cap to enforce on tightening proposals.",
    },
  ]);
  const sections = parseClaudeMdSections(md);
  const rewrittenBody = "2026-05-05 incident: see #200, cap at 50KB.";
  const warnings = findRewriteWarnings({ rewrites: [{ sectionId: "s0", rewrittenBody, estimatedBytesSaved: 50 }] }, sections);
  assert.equal(warnings.length, 0);

  const proposal: TightenProposal = {
    agentId: "agent-test",
    rewrites: [{ sectionId: "s0", rewrittenBody, estimatedBytesSaved: 50 }],
    unchangedSectionIds: [],
    estimatedBytesSaved: 50,
    warnings: [],
  };
  const out = formatTightenProposal(proposal, sections);
  assert.match(out, /\[s0\]/);
  assert.match(out, /Validator:\s*clean/);
});
