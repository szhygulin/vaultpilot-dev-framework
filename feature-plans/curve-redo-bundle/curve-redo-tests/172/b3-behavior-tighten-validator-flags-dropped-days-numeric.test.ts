import { test } from "node:test";
import assert from "node:assert/strict";
import { findDroppedInvariants } from "./tightenClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

test("findDroppedInvariants flags rewrite that drops a days numeric tunable", () => {
  const md =
    "<!-- run:run-A issue:#100 outcome:implement ts:2026-05-05T12:00:00.000Z -->\n" +
    "## Rule\n\nWait at least 30 days before retrying the destructive path.\n";
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedInvariants(
    {
      rewrites: [
        {
          sectionId: "s0",
          rewrittenBody: "Wait a long time before retrying the destructive path.",
          estimatedBytesSaved: 5,
        },
      ],
    },
    sections,
  );
  assert.ok(warnings.length >= 1);
});
