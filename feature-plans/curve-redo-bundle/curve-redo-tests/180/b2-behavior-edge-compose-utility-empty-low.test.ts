import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility on a no-signal record is low (< 0.5)", () => {
  // Empty record: no reinforcement, no pushback, no incidents, no recency,
  // no centrality. Whatever the field names, the composite should be low.
  const u = composeUtility({} as any);
  assert.ok(u < 0.5, `expected u < 0.5 for no-signal record, got ${u}`);
});
