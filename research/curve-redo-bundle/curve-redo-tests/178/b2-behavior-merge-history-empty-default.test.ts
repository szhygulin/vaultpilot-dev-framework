// Edge case: empty collection at file birth — when a utility file is
// freshly created, mergeHistory carries no entries. We accept either
// absent (treated as []) or present-and-empty.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("AgentUtilityFile: mergeHistory is empty (or absent) on a freshly-created file", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "vp-lu-"));
  const stableId = "1".repeat(64);
  await recordReinforcement({
    agentId: "agent-mh-empty",
    runId: "run-1",
    citedSectionStableIds: [stableId],
    stateDir,
  });
  const filePath = join(stateDir, "lesson-utility-agent-mh-empty.json");
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  const mergeHistory = parsed.mergeHistory ?? [];
  assert.equal(Array.isArray(mergeHistory), true, "mergeHistory should be an array if present");
  assert.equal(mergeHistory.length, 0, "freshly-created file has zero merge entries");
});
