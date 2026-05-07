import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

const STATE_DIR = path.join(process.cwd(), "state");
const statePath = (id: string) => path.join(STATE_DIR, `lesson-utility-${id}.json`);
let _c = 0;
const uniq = () => `t-mh-${process.pid}-${Date.now()}-${++_c}`;

test("mergeHistory entries on disk are preserved across recordReinforcement writes", async () => {
  const agentId = uniq();
  const mergeEntry = {
    sourceStableIds: ["sid-old-1", "sid-old-2", "sid-old-3"],
    mergedStableId: "sid-merged-abc",
    mergedAt: "2026-05-04T12:00:00.000Z",
  };
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(statePath(agentId), JSON.stringify({
    agentId,
    schemaVersion: 1,
    sections: [{
      sectionId: "sid-merged-abc", introducedRunId: "run-init", introducedAt: "2026-05-04T12:00:00.000Z",
      reinforcementRuns: [], pushbackRuns: [], pastIncidentDates: [], crossReferenceCount: 0,
    }],
    mergeHistory: [mergeEntry],
  }));
  try {
    await recordReinforcement({ agentId, runId: "after-merge", citedSectionStableIds: ["sid-merged-abc"] });
    const data = JSON.parse(await fs.readFile(statePath(agentId), "utf8"));
    assert.ok(Array.isArray(data.mergeHistory), "mergeHistory must remain an array on disk after writes");
    assert.equal(data.mergeHistory.length, 1);
    const entry = data.mergeHistory[0];
    assert.deepEqual(entry.sourceStableIds, ["sid-old-1", "sid-old-2", "sid-old-3"]);
    assert.equal(entry.mergedStableId, "sid-merged-abc");
    assert.equal(entry.mergedAt, "2026-05-04T12:00:00.000Z");
    // The reinforcement on the merged section still landed.
    const sec = data.sections.find((s: any) => s.sectionId === "sid-merged-abc");
    assert.deepEqual(sec.reinforcementRuns, ["after-merge"]);
  } finally {
    await fs.rm(statePath(agentId), { force: true });
  }
});
