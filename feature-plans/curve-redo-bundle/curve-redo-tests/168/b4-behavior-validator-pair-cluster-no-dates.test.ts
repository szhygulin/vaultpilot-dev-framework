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

test("findDroppedIncidentDates: pair cluster with no dates in either source -> no warnings", () => {
  const md = fakeMd([
    { run: "r-A", issue: 800, heading: "Rule A", body: "recompute hardcoded crypto constants in tool descriptions" },
    { run: "r-B", issue: 801, heading: "Rule B", body: "recompute hardcoded crypto constants in tool descriptions (variant)" },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedIncidentDates(
    {
      clusters: [
        {
          sectionIds: ["s0", "s1"],
          proposedHeading: "Merged pair (no dates)",
          proposedBody: "Combined dateless rule.",
          rationale: "merged",
          sourceProvenance: [],
        },
      ],
    },
    sections,
  );
  assert.equal(warnings.length, 0);
});
