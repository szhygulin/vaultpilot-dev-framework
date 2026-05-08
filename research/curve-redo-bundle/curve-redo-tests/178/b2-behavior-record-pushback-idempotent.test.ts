// Edge case: duplicate input — recording the same pushback twice must
// not multiply the count. Pushback citations count distinct runs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordPushback } from "./lessonUtility.js";

test("recordPushback: same runId added twice is deduplicated", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "vp-lu-"));
  const stableId = "f".repeat(64);
  const filePath = join(stateDir, "lesson-utility-agent-pb-dedup.json");
  writeFileSync(
    filePath,
    JSON.stringify({
      agentId: "agent-pb-dedup",
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
  await recordPushback({
    agentId: "agent-pb-dedup",
    runId: "run-1",
    citedSectionStableIds: [stableId],
    stateDir,
  });
  await recordPushback({
    agentId: "agent-pb-dedup",
    runId: "run-1",
    citedSectionStableIds: [stableId],
    stateDir,
  });
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  const section = (parsed.sections as Array<{ sectionId: string; pushbackRuns: string[] }>).find(
    (s) => s.sectionId === stableId,
  );
  assert.ok(section);
  const occurrences = section!.pushbackRuns.filter((r) => r === "run-1").length;
  assert.equal(occurrences, 1);
});
