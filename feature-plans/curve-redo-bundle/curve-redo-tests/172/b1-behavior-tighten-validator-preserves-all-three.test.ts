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

test("findRewriteWarnings: rewrite preserving date, xref, and numeric returns no warnings", () => {
  const md = fakeMd([
    {
      run: "run-1",
      issue: 137,
      heading: "Rich Rule",
      body: "Past incident 2026-05-05: see #200 about the 50KB cap on prose tightening.",
    },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findRewriteWarnings(
    {
      rewrites: [
        {
          sectionId: "s0",
          rewrittenBody: "2026-05-05: see #200, cap at 50KB.",
          estimatedBytesSaved: 25,
        },
      ],
    },
    sections,
  );
  assert.equal(warnings.length, 0);
});
