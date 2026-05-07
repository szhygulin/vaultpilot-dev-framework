import { test } from "node:test";
import assert from "node:assert/strict";
import { findDroppedInvariants } from "./tightenClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

test("findDroppedInvariants does not flag rewrite preserving all invariants", () => {
  const md =
    "<!-- run:run-A issue:#100 outcome:implement ts:2026-05-05T12:00:00.000Z -->\n" +
    "## Rule\n\nIncident 2026-04-28 (#137): cap at 16KB.\n";
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedInvariants(
    {
      rewrites: [
        {
          sectionId: "s0",
          rewrittenBody: "2026-04-28 #137 cap 16KB.",
          estimatedBytesSaved: 20,
        },
      ],
    },
    sections,
  );
  assert.equal(warnings.length, 0);
});
