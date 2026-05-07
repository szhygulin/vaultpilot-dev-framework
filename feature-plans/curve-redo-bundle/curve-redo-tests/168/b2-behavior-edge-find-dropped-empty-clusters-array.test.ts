import { test } from "node:test";
import assert from "node:assert/strict";
import { findDroppedIncidentDates } from "./compactClaudeMd.js";
import { parseClaudeMdSections } from "./split.js";

test("findDroppedIncidentDates: zero clusters yields zero warnings", () => {
  const md =
    `<!-- run:r issue:#1 outcome:implement ts:2026-05-05T12:00:00.000Z -->\n## H\n\nbody 2026-05-05.\n`;
  const sections = parseClaudeMdSections(md);
  const warnings = findDroppedIncidentDates({ clusters: [] }, sections);
  assert.deepEqual(warnings, []);
});
