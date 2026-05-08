// Edge case: minimal/empty file — the documented schema must accept a
// freshly-initialized file with schemaVersion 1 and zero sections. Both
// the type import and the runtime shape are exercised.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentUtilityFile } from "./lessonUtility.js";

test("AgentUtilityFile: schemaVersion 1 with empty sections is a valid shape", () => {
  const file = {
    agentId: "agent-x",
    schemaVersion: 1,
    sections: [],
    mergeHistory: [],
  } as unknown as AgentUtilityFile;
  const parsed = JSON.parse(JSON.stringify(file));
  assert.equal(parsed.agentId, "agent-x");
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(Array.isArray(parsed.sections), true);
  assert.equal(parsed.sections.length, 0);
});
