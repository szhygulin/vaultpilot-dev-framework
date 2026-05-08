// Edge case: duplicate input — repeated mentions of the same date must
// collapse to a single entry. The issue calls this a 'count of distinct'
// dates, so duplicates do not multiply the density signal.

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPastIncidentDates } from "./lessonUtility.js";

test("extractPastIncidentDates: identical date repeated collapses to single entry", () => {
  const dates = [...extractPastIncidentDates("On 2026-05-05 again 2026-05-05 and once more 2026-05-05.")];
  assert.equal(dates.length, 1);
  assert.equal(dates[0], "2026-05-05");
});
