import { test } from "node:test";
import assert from "node:assert/strict";
import { findDroppedInvariants } from "./tightenClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

test("findDroppedInvariants flags rewrite that drops a KB numeric threshold", () => {
  const md =
    "<!-- run:run-A issue:#100 outcome:implement ts:2026-05-05T12:00:00.000Z -->\n" +
    "## Rule\n\nCap context at 16KB to avoid runaway cost.\n";
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedInvariants(
    {
      rewrites: [
        {
          sectionId: "s0",
          rewrittenBody: "Cap context to a small budget to avoid runaway cost.",
          estimatedBytesSaved: 5,
        },
      ],
    },
    sections,
  );
  assert.ok(warnings.length >= 1);
});
