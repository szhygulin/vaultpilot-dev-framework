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

test("findRewriteWarnings: source with no cross-references produces no xref warnings", () => {
  const md = fakeMd([
    {
      run: "run-1",
      issue: 137,
      heading: "Rule",
      body: "General advice without cross references whatsoever in the prose.",
    },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findRewriteWarnings(
    {
      rewrites: [
        { sectionId: "s0", rewrittenBody: "Advice.", estimatedBytesSaved: 30 },
      ],
    },
    sections,
  );
  const xrefWarnings = warnings.filter((w: { kind?: string }) => /xref|reference/.test(String(w.kind)));
  assert.equal(xrefWarnings.length, 0);
});
