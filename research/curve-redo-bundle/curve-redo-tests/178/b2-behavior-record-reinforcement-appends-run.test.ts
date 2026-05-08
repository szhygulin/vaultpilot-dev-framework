// Edge case: single-element append — adding one runId to a previously
// empty reinforcementRuns array must result in exactly that runId being
// present on the cited section.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("recordReinforcement: appends runId to existing section's reinforcementRuns", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "vp-lu-"));
  const stableId = "b".repeat(64);
  const filePath = join(stateDir, "lesson-utility-agent-append.json");
  writeFileSync(
    filePath,
    JSON.stringify({
      agentId: "agent-append",
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
    agentId: "agent-append",
    runId: "run-1",
    citedSectionStableIds: [stableId],
    stateDir,
  });
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  const section = (parsed.sections as Array<{ sectionId: string; reinforcementRuns: string[] }>).find(
    (s) => s.sectionId === stableId,
  );
  assert.ok(section, "section should still be present");
  assert.ok(section!.reinforcementRuns.includes("run-1"), "run-1 should be appended");
});
