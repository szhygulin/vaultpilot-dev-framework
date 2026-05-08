// Edge case: single-element preserved across writes — when the file
// already has one mergeHistory entry, a subsequent recordReinforcement
// must NOT clobber or drop it. The merge-history is independent of
// citation bookkeeping.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("AgentUtilityFile: pre-seeded mergeHistory entry survives recordReinforcement", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "vp-lu-"));
  const stableId = "2".repeat(64);
  const filePath = join(stateDir, "lesson-utility-agent-mh-rt.json");
  const seed = {
    agentId: "agent-mh-rt",
    schemaVersion: 1,
    sections: [
      {
        sectionId: stableId,
        introducedRunId: "run-0",
        introducedAt: "2026-05-01T00:00:00.000Z",
        reinforcementRuns: [],
        pushbackRuns: [],
        pastIncidentDates: [],
        crossReferenceCount: 0,
      },
    ],
    mergeHistory: [
      {
        sourceStableIds: ["aaa", "bbb"],
        mergedStableId: "ccc",
        mergedAt: "2026-05-02T00:00:00.000Z",
      },
    ],
  };
  writeFileSync(filePath, JSON.stringify(seed));
  await recordReinforcement({
    agentId: "agent-mh-rt",
    runId: "run-1",
    citedSectionStableIds: [stableId],
    stateDir,
  });
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  assert.ok(Array.isArray(parsed.mergeHistory), "mergeHistory should still be an array");
  assert.equal(parsed.mergeHistory.length, 1, "existing merge-history entry must survive");
  assert.equal(parsed.mergeHistory[0].mergedStableId, "ccc");
  assert.deepEqual(parsed.mergeHistory[0].sourceStableIds, ["aaa", "bbb"]);
});
