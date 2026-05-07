// Edge case: empty collection persisted — the file format must round-trip
// through JSON.stringify/JSON.parse with `sections: []` preserved as an
// array (not dropped to undefined and not turned into an object).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentUtilityFile } from "./lessonUtility.js";

test("AgentUtilityFile: empty sections array round-trips through JSON", () => {
  const file = {
    agentId: "agent-empty",
    schemaVersion: 1,
    sections: [],
    mergeHistory: [],
  } as unknown as AgentUtilityFile;
  const json = JSON.stringify(file);
  const parsed = JSON.parse(json);
  assert.equal(Array.isArray(parsed.sections), true);
  assert.equal(parsed.sections.length, 0);
  assert.equal(parsed.schemaVersion, 1);
});
