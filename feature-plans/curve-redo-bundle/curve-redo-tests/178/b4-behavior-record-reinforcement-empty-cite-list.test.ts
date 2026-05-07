import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

const STATE_DIR = path.join(process.cwd(), "state");
const statePath = (id: string) => path.join(STATE_DIR, `lesson-utility-${id}.json`);
let _c = 0;
const uniq = () => `t-rr-empty-${process.pid}-${Date.now()}-${++_c}`;

test("recordReinforcement with empty citedSectionStableIds is fail-soft (no throw, file remains valid)", async () => {
  const agentId = uniq();
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(statePath(agentId), JSON.stringify({
    agentId,
    schemaVersion: 1,
    sections: [{
      sectionId: "sid-e", introducedRunId: "run-init", introducedAt: "2026-05-01T00:00:00.000Z",
      reinforcementRuns: ["existing"], pushbackRuns: [], pastIncidentDates: [], crossReferenceCount: 0,
    }],
  }));
  try {
    await assert.doesNotReject(
      recordReinforcement({ agentId, runId: "run-empty", citedSectionStableIds: [] }),
      "empty cite list must not throw — issue says hook is fire-and-forget / fail-soft",
    );
    // Existing data must still be present and parseable.
    const data = JSON.parse(await fs.readFile(statePath(agentId), "utf8"));
    const sec = data.sections.find((s: any) => s.sectionId === "sid-e");
    assert.deepEqual(sec.reinforcementRuns, ["existing"]);
  } finally {
    await fs.rm(statePath(agentId), { force: true });
  }
});
