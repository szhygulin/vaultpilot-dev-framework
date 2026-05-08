// Edge case: minimal record — a freshly-introduced section has empty
// reinforcementRuns, empty pushbackRuns, empty pastIncidentDates, and
// crossReferenceCount of 0 (since the sweep has not yet run).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { SectionUtilityRecord } from "./lessonUtility.js";

test("SectionUtilityRecord: zero-cited freshly-introduced record has empty arrays and crossRef 0", () => {
  const rec = {
    sectionId: "abc",
    introducedRunId: "run-1",
    introducedAt: "2026-05-07T00:00:00.000Z",
    reinforcementRuns: [],
    pushbackRuns: [],
    pastIncidentDates: [],
    crossReferenceCount: 0,
  } as unknown as SectionUtilityRecord;
  const parsed = JSON.parse(JSON.stringify(rec));
  assert.deepEqual(parsed.reinforcementRuns, []);
  assert.deepEqual(parsed.pushbackRuns, []);
  assert.deepEqual(parsed.pastIncidentDates, []);
  assert.equal(parsed.crossReferenceCount, 0);
});
