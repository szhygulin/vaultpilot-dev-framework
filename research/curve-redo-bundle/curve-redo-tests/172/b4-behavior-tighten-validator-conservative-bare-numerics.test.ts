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

test("findDroppedInvariants: bare numerics like 'K=3' or 'factor 1.5' are not flagged", () => {
  const md = fakeMd([
    { run: "run-A", issue: 100, heading: "Rule A", body: "Set K=3 for the cluster and use factor 1.5 to scale the bound. No units." },
  ]);
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedInvariants(
    {
      rewrites: [
        {
          sectionId: sections[0].id,
          rewrittenBody: "Set the cluster K and scaling factor. No units.",
          estimatedBytesSaved: 26,
        },
      ],
    } as any,
    sections,
  );
  assert.equal(warnings.length, 0, "conservative pattern should not flag bare numerics");
});
