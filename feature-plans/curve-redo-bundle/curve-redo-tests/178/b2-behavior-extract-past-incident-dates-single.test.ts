// Edge case: single-element collection — a body with exactly one ISO date
// should yield that date and only that date.

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPastIncidentDates } from "./lessonUtility.js";

test("extractPastIncidentDates: single ISO date in body returns that one date", () => {
  const dates = [...extractPastIncidentDates("Past incident 2026-05-05: thing happened.")];
  assert.equal(dates.length, 1);
  assert.equal(dates[0], "2026-05-05");
});
