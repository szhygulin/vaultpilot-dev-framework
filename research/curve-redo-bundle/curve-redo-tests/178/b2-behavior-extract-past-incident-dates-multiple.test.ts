// Edge case: multi-element collection — multiple distinct dates must all
// be returned (in some order). We sort before comparing because order is
// not part of the contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPastIncidentDates } from "./lessonUtility.js";

test("extractPastIncidentDates: multiple distinct dates all returned", () => {
  const dates = [...extractPastIncidentDates("Saw 2026-04-28 then 2026-05-05 and earlier 2025-12-31.")];
  const sorted = dates.slice().sort();
  assert.deepEqual(sorted, ["2025-12-31", "2026-04-28", "2026-05-05"]);
});
