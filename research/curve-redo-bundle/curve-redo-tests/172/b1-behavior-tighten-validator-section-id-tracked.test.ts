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

test("findRewriteWarnings: warning carries the originating sectionId", () => {
  const md = fakeMd([
    { run: "run-1", issue: 137, heading: "A", body: "Past incident 2026-04-28: foo." },
    { run: "run-2", issue: 138, heading: "B", body: "Past incident 2026-05-05: bar." },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findRewriteWarnings(
    {
      rewrites: [
        {
          sectionId: "s1",
          rewrittenBody: "Bar without any date.",
          estimatedBytesSaved: 10,
        },
      ],
    },
    sections,
  );
  assert.ok(warnings.length >= 1, "expected warnings for dropped date in s1");
  const referencesS1 = warnings.some((w: unknown) => JSON.stringify(w).includes("s1"));
  assert.ok(referencesS1, "warning should reference originating sectionId s1");
});
