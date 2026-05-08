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

test("findRewriteWarnings: source with no numeric thresholds produces no numeric warnings", () => {
  const md = fakeMd([
    {
      run: "run-1",
      issue: 137,
      heading: "Rule",
      body: "Pure prose advice without any quantified thresholds in the body.",
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
  const numericWarnings = warnings.filter((w: { kind?: string }) =>
    /numeric|threshold|number/.test(String(w.kind)),
  );
  assert.equal(numericWarnings.length, 0);
});
