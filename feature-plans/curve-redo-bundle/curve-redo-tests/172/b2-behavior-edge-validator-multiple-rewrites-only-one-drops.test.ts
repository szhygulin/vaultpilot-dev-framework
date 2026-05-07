import { test } from "node:test";
import assert from "node:assert/strict";
import { findTightenWarnings, type TightenProposal } from "./tightenClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

function fakeMd(sections: Array<{ run: string; issue: number; heading: string; body: string }>): string {
  return sections
    .map(
      (s) =>
        `<!-- run:${s.run} issue:#${s.issue} outcome:implement ts:2026-05-05T12:00:00.000Z -->\n## ${s.heading}\n\n${s.body}\n`,
    )
    .join("\n");
}

test("findTightenWarnings: only the rewrite that drops an invariant produces warnings", () => {
  const md = fakeMd([
    { run: "run-A", issue: 100, heading: "Rule A", body: "Capped at 5KB." },
    { run: "run-B", issue: 101, heading: "Rule B", body: "Past incident 2026-04-28: foo." },
  ]);
  const sections = parseClaudeMdSections(md);
  const proposal: TightenProposal = {
    agentId: "agent-x",
    rewrites: [
      { sectionId: "s0", rewrittenBody: "Capped at 5KB.", estimatedBytesSaved: 0 },
      { sectionId: "s1", rewrittenBody: "Past foo, no date.", estimatedBytesSaved: 10 },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 10,
    warnings: [],
  };
  const warnings = findTightenWarnings(proposal, sections);
  assert.ok(warnings.length >= 1, "expected warning(s) only for the offending rewrite");
});
