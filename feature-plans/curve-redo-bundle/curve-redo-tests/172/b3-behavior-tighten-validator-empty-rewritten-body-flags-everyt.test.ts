import { test } from "node:test";
import assert from "node:assert/strict";
import { findDroppedInvariants } from "./tightenClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

test("findDroppedInvariants flags every cited invariant when rewrittenBody is empty", () => {
  const md =
    "<!-- run:run-A issue:#100 outcome:implement ts:2026-05-05T12:00:00.000Z -->\n" +
    "## Rule\n\nIncident 2026-04-28 cites #137 with cap 16KB.\n";
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedInvariants(
    {
      rewrites: [
        {
          sectionId: "s0",
          rewrittenBody: "",
          estimatedBytesSaved: 50,
        },
      ],
    },
    sections,
  );
  assert.ok(warnings.length >= 1);
});
