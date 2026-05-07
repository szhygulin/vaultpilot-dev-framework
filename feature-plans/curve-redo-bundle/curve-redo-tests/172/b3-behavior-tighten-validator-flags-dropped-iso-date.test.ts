import { test } from "node:test";
import assert from "node:assert/strict";
import { findDroppedInvariants } from "./tightenClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

test("findDroppedInvariants flags rewrite that drops a cited ISO date", () => {
  const md =
    "<!-- run:run-A issue:#100 outcome:implement ts:2026-05-05T12:00:00.000Z -->\n" +
    "## Rule A\n\nPast incident 2026-04-28: foo happened.\n";
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedInvariants(
    {
      rewrites: [
        {
          sectionId: "s0",
          rewrittenBody: "Vague rewrite without the date.",
          estimatedBytesSaved: 10,
        },
      ],
    },
    sections,
  );
  assert.ok(warnings.length >= 1);
  assert.ok(JSON.stringify(warnings).includes("2026-04-28"));
});
