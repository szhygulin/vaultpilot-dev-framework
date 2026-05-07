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

test("findDroppedInvariants: source with no xrefs yields no xref warning", () => {
  const md = fakeMd([
    { run: "run-A", issue: 100, heading: "Rule A", body: "Discussion without any cross-reference, just plain narrative content." },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedInvariants(
    {
      rewrites: [
        {
          sectionId: sections[0].id,
          rewrittenBody: "Brief narrative content.",
          estimatedBytesSaved: 20,
        },
      ],
    } as any,
    sections,
  );
  assert.equal(warnings.length, 0);
});
