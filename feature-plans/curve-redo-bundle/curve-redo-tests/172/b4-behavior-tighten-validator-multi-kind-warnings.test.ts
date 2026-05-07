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

test("findDroppedInvariants: rewrite that drops a date AND an xref AND a numeric raises multiple warnings", () => {
  const md = fakeMd([
    {
      run: "run-A",
      issue: 100,
      heading: "Rule A",
      body: "Past incident 2026-04-28 (#137): refusal to surface a rewrite saving more than 40% indicates lossy paraphrase.",
    },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedInvariants(
    {
      rewrites: [
        {
          sectionId: sections[0].id,
          rewrittenBody: "Past incident: refusal to surface a rewrite saving too much indicates loss.",
          estimatedBytesSaved: 40,
        },
      ],
    } as any,
    sections,
  );
  assert.ok(warnings.length >= 2, `expected multiple warnings, got ${warnings.length}`);
});
