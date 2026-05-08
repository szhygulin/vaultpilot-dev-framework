// Edge case: single-element append — recording a pushback citation must
// append the runId to pushbackRuns and not silently merge it into
// reinforcementRuns.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordPushback } from "./lessonUtility.js";

test("recordPushback: appends runId to pushbackRuns of cited section", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "vp-lu-"));
  const stableId = "e".repeat(64);
  const filePath = join(stateDir, "lesson-utility-agent-pb.json");
  writeFileSync(
    filePath,
    JSON.stringify({
      agentId: "agent-pb",
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
    agentId: "agent-pb",
    runId: "run-pb-1",
    citedSectionStableIds: [stableId],
    stateDir,
  });
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  const section = (parsed.sections as Array<{ sectionId: string; pushbackRuns: string[]; reinforcementRuns: string[] }>).find(
    (s) => s.sectionId === stableId,
  );
  assert.ok(section);
  assert.ok(section!.pushbackRuns.includes("run-pb-1"), "run should land in pushbackRuns");
  assert.equal(
    section!.reinforcementRuns.includes("run-pb-1"),
    false,
    "pushback runId should NOT leak into reinforcementRuns",
  );
});
