import { test } from "node:test";
import assert from "node:assert/strict";
import { findDroppedIncidentDates } from "./compactClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

function fakeMd(
  sections: Array<{ run: string; issue: number; heading: string; body: string }>,
): string {
  return sections
    .map(
      (s) =>
        `<!-- run:${s.run} issue:#${s.issue} outcome:implement ts:2026-05-05T12:00:00.000Z -->\n## ${s.heading}\n\n${s.body}\n`,
    )
    .join("\n");
}

test("findDroppedIncidentDates: 2-section cluster with all source dates preserved → no warning", () => {
  const md = fakeMd([
    { run: "run-A", issue: 608, heading: "Hardcoded crypto A", body: "Past incident 2026-04-28: foo." },
    { run: "run-B", issue: 608, heading: "Hardcoded crypto B", body: "Past incident 2026-05-05: bar." },
  ]);
  const sections = parseClaudeMdSections(md);
  assert.equal(sections.length, 2);
  const warnings = findDroppedIncidentDates(
    {
      clusters: [
        {
          sectionIds: ["s0", "s1"],
          proposedHeading: "Recompute hardcoded crypto constants in tool descriptions",
          proposedBody:
            "Combined: 2026-04-28 (foo) and 2026-05-05 (bar) both stem from issue #608.",
          rationale: "pair-merge",
          sourceProvenance: [],
        },
      ],
    },
    sections,
  );
  assert.deepEqual(warnings, []);
});
