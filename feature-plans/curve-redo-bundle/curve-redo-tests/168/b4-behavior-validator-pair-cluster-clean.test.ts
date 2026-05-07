import { test } from "node:test";
import assert from "node:assert/strict";
import { findDroppedIncidentDates } from "./compactClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

function fakeMd(sections: Array<{ run: string; issue: number; heading: string; body: string }>): string {
  return sections
    .map(
      (s) =>
        `<!-- run:${s.run} issue:#${s.issue} outcome:implement ts:2026-05-05T12:00:00.000Z -->\n## ${s.heading}\n\n${s.body}\n`,
    )
    .join("\n");
}

test("findDroppedIncidentDates: pair cluster (size 2) with all dates preserved -> no warnings", () => {
  const md = fakeMd([
    { run: "r-A", issue: 600, heading: "Rule A", body: "Past incident 2026-04-28: foo." },
    { run: "r-B", issue: 601, heading: "Rule B", body: "Past incident 2026-05-05: bar." },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedIncidentDates(
    {
      clusters: [
        {
          sectionIds: ["s0", "s1"],
          proposedHeading: "Merged pair",
          proposedBody: "Combined: 2026-04-28 (foo), 2026-05-05 (bar).",
          rationale: "merged",
          sourceProvenance: [],
        },
      ],
    },
    sections,
  );
  assert.equal(warnings.length, 0);
});
