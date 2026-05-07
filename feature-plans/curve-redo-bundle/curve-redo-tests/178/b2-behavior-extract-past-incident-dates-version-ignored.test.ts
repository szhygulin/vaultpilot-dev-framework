// Edge case: false-positive guard — version numbers like `1.2.345` and
// short numeric runs like `12-34-56` must not match. Only YYYY-MM-DD with
// a 20xx year counts as an ISO incident date per the issue body.

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPastIncidentDates } from "./lessonUtility.js";

test("extractPastIncidentDates: version numbers and 2-digit dates do not match", () => {
  const dates = [...extractPastIncidentDates("Released 1.2.345 on 12-34-56, no real incident.")];
  assert.equal(dates.length, 0);
});
