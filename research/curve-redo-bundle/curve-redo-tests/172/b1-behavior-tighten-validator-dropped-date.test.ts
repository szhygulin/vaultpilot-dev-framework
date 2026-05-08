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

test("findRewriteWarnings: rewrite that drops a 20XX-XX-XX date is flagged", () => {
  const md = fakeMd([
    {
      run: "run-1",
      issue: 137,
      heading: "Rule A",
      body: "Past incident 2026-05-05: a long original prose body that explains the rule in many words.",
    },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findRewriteWarnings(
    {
      rewrites: [
        {
          sectionId: "s0",
          rewrittenBody: "Past incident: shortened version with no date reference at all.",
          estimatedBytesSaved: 30,
        },
      ],
    },
    sections,
  );
  assert.ok(warnings.length >= 1, "expected at least one warning for dropped date");
  assert.ok(
    warnings.some((w: { kind?: string }) => /incident|date/.test(String(w.kind))),
    "warning kind should reference incident/date",
  );
});
