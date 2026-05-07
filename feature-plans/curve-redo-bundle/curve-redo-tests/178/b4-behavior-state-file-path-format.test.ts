import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

let _c = 0;
const uniq = () => `t-pathfmt-${process.pid}-${Date.now()}-${++_c}`;

test("state file is written at exactly state/lesson-utility-<agentId>.json", async () => {
  const agentId = uniq();
  const expectedPath = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  const stateDir = path.join(process.cwd(), "state");
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(expectedPath, JSON.stringify({
    agentId,
    schemaVersion: 1,
    sections: [{
      sectionId: "sid-p", introducedRunId: "run-init", introducedAt: "2026-05-01T00:00:00.000Z",
      reinforcementRuns: [], pushbackRuns: [], pastIncidentDates: [], crossReferenceCount: 0,
    }],
  }));
  try {
    await recordReinforcement({ agentId, runId: "r1", citedSectionStableIds: ["sid-p"] });
    const stat = await fs.stat(expectedPath);
    assert.ok(stat.isFile(), "file at state/lesson-utility-<agentId>.json must exist after recordReinforcement");
  } finally {
    await fs.rm(expectedPath, { force: true });
  }
});
