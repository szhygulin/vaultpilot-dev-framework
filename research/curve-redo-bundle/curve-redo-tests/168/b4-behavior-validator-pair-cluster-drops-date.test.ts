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

test("findDroppedIncidentDates: pair cluster that drops a date still hard-rejects (validator unchanged)", () => {
  // Per issue: 'collapsed-distinct-rules validator runs identically — pairs with distinct
  // past-incident dates that get dropped from the merged body still hard-reject.'
  const md = fakeMd([
    { run: "r-A", issue: 700, heading: "Rule A", body: "Past incident 2026-04-28: foo." },
    { run: "r-B", issue: 701, heading: "Rule B", body: "Past incident 2026-05-05: bar." },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedIncidentDates(
    {
      clusters: [
        {
          sectionIds: ["s0", "s1"],
          proposedHeading: "Merged pair",
          // Drops 2026-04-28 entirely.
          proposedBody: "Combined: see 2026-05-05.",
          rationale: "merged",
          sourceProvenance: [],
        },
      ],
    },
    sections,
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].kind, "dropped-incident-date");
  if (warnings[0].kind !== "dropped-incident-date") return;
  assert.deepEqual(warnings[0].missingDates, ["2026-04-28"]);
});
