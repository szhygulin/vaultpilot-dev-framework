// Edge case: duplicate input — calling recordReinforcement twice with the
// same (runId, stableId) pair must not double-count. The reinforcement
// signal counts distinct subsequent runs, so the runId appears at most
// once per section.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("recordReinforcement: same runId added twice is deduplicated", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "vp-lu-"));
  const stableId = "c".repeat(64);
  const filePath = join(stateDir, "lesson-utility-agent-dedup.json");
  writeFileSync(
    filePath,
    JSON.stringify({
      agentId: "agent-dedup",
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
      mergeHistory: [],
    }),
  );
  await recordReinforcement({
    agentId: "agent-dedup",
    runId: "run-1",
    citedSectionStableIds: [stableId],
    stateDir,
  });
  await recordReinforcement({
    agentId: "agent-dedup",
    runId: "run-1",
    citedSectionStableIds: [stableId],
    stateDir,
  });
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  const section = (parsed.sections as Array<{ sectionId: string; reinforcementRuns: string[] }>).find(
    (s) => s.sectionId === stableId,
  );
  assert.ok(section);
  const occurrences = section!.reinforcementRuns.filter((r) => r === "run-1").length;
  assert.equal(occurrences, 1, "runId should appear at most once");
});
