import { test } from "node:test";
import assert from "node:assert/strict";
import { findDroppedInvariants } from "./tightenClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

test("findDroppedInvariants flags multiple invariants dropped by the same rewrite", () => {
  const md =
    "<!-- run:run-A issue:#100 outcome:implement ts:2026-05-05T12:00:00.000Z -->\n" +
    "## Rule\n\nIncident 2026-04-28 (#137): cap at 16KB after 7 days.\n";
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedInvariants(
    {
      rewrites: [
        {
          sectionId: "s0",
          rewrittenBody: "Old incident: cap context after a while.",
          estimatedBytesSaved: 30,
        },
      ],
    },
    sections,
  );
  assert.ok(warnings.length >= 1);
  const text = JSON.stringify(warnings);
  assert.ok(text.includes("2026-04-28"));
  assert.ok(text.includes("137"));
});
