import { test } from "node:test";
import assert from "node:assert/strict";
import { findRewriteWarnings } from "./tightenClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

function fakeMd(sections: Array<{ run: string; issue: number; heading: string; body: string }>): string {
  return sections
    .map(
      (s) =>
        `<!-- run:${s.run} issue:#${s.issue} outcome:implement ts:2026-05-05T12:00:00.000Z -->\n## ${s.heading}\n\n${s.body}\n`,
    )
    .join("\n");
}

test("findRewriteWarnings: rewrite that drops a #NNN cross-reference is flagged", () => {
  const md = fakeMd([
    {
      run: "run-1",
      issue: 137,
      heading: "Rule B",
      body: "See issue #200 for details and #173 for the followup phase work.",
    },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findRewriteWarnings(
    {
      rewrites: [
        {
          sectionId: "s0",
          rewrittenBody: "See linked issues for details and the follow-up phase work.",
          estimatedBytesSaved: 20,
        },
      ],
    },
    sections,
  );
  assert.ok(warnings.length >= 1, "expected at least one warning for dropped xref");
  assert.ok(
    warnings.some((w: { kind?: string }) => /xref|reference/.test(String(w.kind))),
    "warning kind should reference xref",
  );
});
