import { test } from "node:test";
import assert from "node:assert/strict";
import { findDroppedIncidentDates } from "./compactClaudeMd.js";

test("findDroppedIncidentDates: empty clusters + empty sections returns []", () => {
  const warnings = findDroppedIncidentDates({ clusters: [] }, []);
  assert.equal(Array.isArray(warnings), true);
  assert.equal(warnings.length, 0);
});
