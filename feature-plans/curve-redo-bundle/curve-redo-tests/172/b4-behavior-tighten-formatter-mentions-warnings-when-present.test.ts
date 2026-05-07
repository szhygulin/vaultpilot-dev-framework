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

test("formatTightenProposal: when warnings exist they appear in output (not 'clean')", () => {
  const md = fakeMd([
    { run: "run-A", issue: 100, heading: "Rule A", body: "Past incident 2026-04-28 referenced multiple times for context here." },
  ]);
  const sections = parseClaudeMdSections(md);
  const proposal = {
    agentId: "agent-test",
    rewrites: [
      {
        sectionId: sections[0].id,
        rewrittenBody: "Past incident referenced multiple times.",
        estimatedBytesSaved: 30,
      },
    ],
    unchangedSectionIds: [],
    estimatedBytesSaved: 30,
    warnings: [
      { kind: "dropped-incident-date", missingDates: ["2026-04-28"], fromSectionIds: [sections[0].id] },
    ],
  };
  const out = formatTightenProposal(proposal as any, sections);
  assert.ok(
    /2026-04-28/.test(out) || /dropped/i.test(out),
    "expected formatter to surface the dropped-date warning content",
  );
});
