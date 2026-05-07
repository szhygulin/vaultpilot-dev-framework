import { test } from "node:test";
import assert from "node:assert/strict";
import { findDroppedInvariants } from "./tightenClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

test("findDroppedInvariants flags rewrite that drops a cited #NNN cross-reference", () => {
  const md =
    "<!-- run:run-A issue:#100 outcome:implement ts:2026-05-05T12:00:00.000Z -->\n" +
    "## Rule A\n\nFollow-up was done in #137 per the precedent.\n";
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedInvariants(
    {
      rewrites: [
        {
          sectionId: "s0",
          rewrittenBody: "Follow-up was done per the precedent.",
          estimatedBytesSaved: 8,
        },
      ],
    },
    sections,
  );
  assert.ok(warnings.length >= 1);
  assert.ok(JSON.stringify(warnings).includes("137"));
});
