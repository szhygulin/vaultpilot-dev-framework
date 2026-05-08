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

test("findDroppedInvariants: rewrite dropping `200 MB` numeric is flagged", () => {
  const md = fakeMd([
    { run: "run-A", issue: 100, heading: "Rule A", body: "Bundle artifacts must remain under 200 MB before upload." },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedInvariants(
    {
      rewrites: [
        {
          sectionId: sections[0].id,
          rewrittenBody: "Bundle artifacts must remain small before upload.",
          estimatedBytesSaved: 18,
        },
      ],
    } as any,
    sections,
  );
  assert.ok(warnings.length >= 1, "expected dropped-numeric warning for MB threshold");
});
