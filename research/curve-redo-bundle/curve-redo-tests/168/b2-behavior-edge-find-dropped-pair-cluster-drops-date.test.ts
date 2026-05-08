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

test("findDroppedIncidentDates: 2-section pair-merge that drops a date is flagged (validator unchanged)", () => {
  // Per issue: validator runs identically on pair clusters. Hard reject still fires.
  const md = fakeMd([
    { run: "run-A", issue: 608, heading: "A", body: "Past incident 2026-04-28: foo." },
    { run: "run-B", issue: 608, heading: "B", body: "Past incident 2026-05-05: bar." },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedIncidentDates(
    {
      clusters: [
        {
          sectionIds: ["s0", "s1"],
          proposedHeading: "Merged",
          // Drops 2026-04-28.
          proposedBody: "Only mentions 2026-05-05.",
          rationale: "pair-merge",
          sourceProvenance: [],
        },
      ],
    },
    sections,
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].kind, "dropped-incident-date");
});
