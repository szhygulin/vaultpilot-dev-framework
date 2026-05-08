import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

const STATE_DIR = path.join(process.cwd(), "state");
const statePath = (id: string) => path.join(STATE_DIR, `lesson-utility-${id}.json`);
let _c = 0;
const uniq = () => `t-pres-other-${process.pid}-${Date.now()}-${++_c}`;

test("recordReinforcement preserves all non-cited sections unchanged", async () => {
  const agentId = uniq();
  const sectionUntouched = {
    sectionId: "sid-keep",
    introducedRunId: "run-99",
    introducedAt: "2025-12-01T00:00:00.000Z",
    reinforcementRuns: ["prior-1", "prior-2"],
    pushbackRuns: ["pb-prior"],
    pastIncidentDates: ["2025-11-30"],
    crossReferenceCount: 4,
    lastReinforcedAt: "2025-12-15T00:00:00.000Z",
  };
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(statePath(agentId), JSON.stringify({
    agentId,
    schemaVersion: 1,
    sections: [
      sectionUntouched,
      {
        sectionId: "sid-target", introducedRunId: "run-init", introducedAt: "2026-05-01T00:00:00.000Z",
        reinforcementRuns: [], pushbackRuns: [], pastIncidentDates: [], crossReferenceCount: 0,
      },
    ],
  }));
  try {
    await recordReinforcement({ agentId, runId: "r-target", citedSectionStableIds: ["sid-target"] });
    const data = JSON.parse(await fs.readFile(statePath(agentId), "utf8"));
    const keep = data.sections.find((s: any) => s.sectionId === "sid-keep");
    assert.ok(keep, "non-cited section must still be present");
    assert.deepEqual(keep.reinforcementRuns, ["prior-1", "prior-2"]);
    assert.deepEqual(keep.pushbackRuns, ["pb-prior"]);
    assert.deepEqual(keep.pastIncidentDates, ["2025-11-30"]);
    assert.equal(keep.crossReferenceCount, 4);
    assert.equal(keep.introducedRunId, "run-99");
    assert.equal(keep.introducedAt, "2025-12-01T00:00:00.000Z");
    assert.equal(keep.lastReinforcedAt, "2025-12-15T00:00:00.000Z");
  } finally {
    await fs.rm(statePath(agentId), { force: true });
  }
});
