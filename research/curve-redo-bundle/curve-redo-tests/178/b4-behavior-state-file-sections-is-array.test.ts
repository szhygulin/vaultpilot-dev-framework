import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

const STATE_DIR = path.join(process.cwd(), "state");
const statePath = (id: string) => path.join(STATE_DIR, `lesson-utility-${id}.json`);
let _c = 0;
const uniq = () => `t-secarr-${process.pid}-${Date.now()}-${++_c}`;

test("sections field remains an array of records after recordReinforcement", async () => {
  const agentId = uniq();
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(statePath(agentId), JSON.stringify({
    agentId,
    schemaVersion: 1,
    sections: [
      { sectionId: "sid-1", introducedRunId: "run-init", introducedAt: "2026-05-01T00:00:00.000Z",
        reinforcementRuns: [], pushbackRuns: [], pastIncidentDates: [], crossReferenceCount: 0 },
      { sectionId: "sid-2", introducedRunId: "run-init", introducedAt: "2026-05-01T00:00:00.000Z",
        reinforcementRuns: [], pushbackRuns: [], pastIncidentDates: [], crossReferenceCount: 0 },
    ],
  }));
  try {
    await recordReinforcement({ agentId, runId: "r1", citedSectionStableIds: ["sid-1"] });
    const data = JSON.parse(await fs.readFile(statePath(agentId), "utf8"));
    assert.ok(Array.isArray(data.sections), "data.sections must be an array");
    assert.equal(data.sections.length, 2, "existing section count must be preserved");
    for (const s of data.sections) {
      assert.equal(typeof s.sectionId, "string");
      assert.ok(Array.isArray(s.reinforcementRuns));
      assert.ok(Array.isArray(s.pushbackRuns));
      assert.ok(Array.isArray(s.pastIncidentDates));
      assert.equal(typeof s.crossReferenceCount, "number");
    }
  } finally {
    await fs.rm(statePath(agentId), { force: true });
  }
});
