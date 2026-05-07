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

test("findTightenWarnings: preserving all of multiple source dates -> no warnings", () => {
  const md = fakeMd([
    { run: "run-A", issue: 100, heading: "Rule A", body: "Incidents on 2026-04-28 and 2026-05-05 reshaped policy." },
  ]);
  const sections = parseClaudeMdSections(md);
  const proposal: TightenProposal = {
    agentId: "agent-x",
    rewrites: [
      { sectionId: "s0", rewrittenBody: "See 2026-04-28, 2026-05-05.", estimatedBytesSaved: 25 },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 25,
    warnings: [],
  };
  const warnings = findTightenWarnings(proposal, sections);
  assert.equal(warnings.length, 0);
});
