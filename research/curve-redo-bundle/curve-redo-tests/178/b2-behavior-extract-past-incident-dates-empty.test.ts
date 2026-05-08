// Edge case: empty input — extracting past-incident dates from an empty
// string must yield zero dates, not a crash and not a stray empty entry.

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPastIncidentDates } from "./lessonUtility.js";

test("extractPastIncidentDates: empty body returns no dates", () => {
  const dates = [...extractPastIncidentDates("")];
  assert.equal(dates.length, 0);
});
