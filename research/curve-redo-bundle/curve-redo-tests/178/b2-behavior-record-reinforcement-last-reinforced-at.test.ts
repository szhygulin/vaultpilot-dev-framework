// Edge case: timestamp boundary — lastReinforcedAt must be set to a
// timestamp on or near 'now' (the call site time). We allow 5s of slop
// for filesystem and clock drift.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("recordReinforcement: sets lastReinforcedAt on the cited section near now", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "vp-lu-"));
  const stableId = "d".repeat(64);
  const filePath = join(stateDir, "lesson-utility-agent-ts.json");
  writeFileSync(
    filePath,
    JSON.stringify({
      agentId: "agent-ts",
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
  const before = Date.now();
  await recordReinforcement({
    agentId: "agent-ts",
    runId: "run-1",
    citedSectionStableIds: [stableId],
    stateDir,
  });
  const after = Date.now();
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  const section = (parsed.sections as Array<{ sectionId: string; lastReinforcedAt?: string }>).find(
    (s) => s.sectionId === stableId,
  );
  assert.ok(section, "section present");
  assert.ok(section!.lastReinforcedAt, "lastReinforcedAt should be set");
  const ts = Date.parse(section!.lastReinforcedAt!);
  assert.ok(
    ts >= before - 5000 && ts <= after + 5000,
    `lastReinforcedAt ${section!.lastReinforcedAt} should be within 5s of now`,
  );
});
