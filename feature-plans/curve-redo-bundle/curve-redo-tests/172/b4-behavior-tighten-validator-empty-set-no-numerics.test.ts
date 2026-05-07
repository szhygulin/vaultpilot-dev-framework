import { test } from "node:test";
import assert from "node:assert/strict";
import { findDroppedInvariants } from "./tightenClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

function fakeMd(sections: Array<{ run: string; issue: number; heading: string; body: string }>): string {
  return sections
    .map(
      (s) =>
        `<!-- run:${s.run} issue:#${s.issue} outcome:implement ts:2026-05-05T12:00:00.000Z -->\n## ${s.heading}\n\n${s.body}\n`,
    )
    .join("\n");
}

test("findDroppedInvariants: source body with no numeric thresholds yields no numeric warning", () => {
  const md = fakeMd([
    { run: "run-A", issue: 100, heading: "Rule A", body: "Prefer descriptive narrative without thresholds or counts." },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedInvariants(
    {
      rewrites: [
        {
          sectionId: sections[0].id,
          rewrittenBody: "Prefer descriptive narrative.",
          estimatedBytesSaved: 22,
        },
      ],
    } as any,
    sections,
  );
  assert.equal(warnings.length, 0);
});
