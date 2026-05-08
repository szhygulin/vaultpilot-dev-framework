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

test("findDroppedInvariants: rewrite that drops a source ISO date is flagged", () => {
  const md = fakeMd([
    { run: "run-A", issue: 100, heading: "Rule A", body: "Past incident 2026-04-28: a long detailed explanation of the failure mode." },
  ]);
  const sections = parseClaudeMdSections(md);
  assert.equal(sections.length, 1);
  const warnings = findDroppedInvariants(
    {
      rewrites: [
        {
          sectionId: sections[0].id,
          rewrittenBody: "Past incident: a brief explanation of the failure mode.",
          estimatedBytesSaved: 30,
        },
      ],
    } as any,
    sections,
  );
  assert.ok(warnings.length >= 1, "expected at least one warning for dropped date");
});
