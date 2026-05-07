import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

const STATE_DIR = path.join(process.cwd(), "state");
const statePath = (id: string) => path.join(STATE_DIR, `lesson-utility-${id}.json`);
let _c = 0;
const uniq = () => `t-recent-${process.pid}-${Date.now()}-${++_c}`;

test("lastReinforcedAt is set close to the current wall-clock time", async () => {
  const agentId = uniq();
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(statePath(agentId), JSON.stringify({
    agentId,
    schemaVersion: 1,
    sections: [{
      sectionId: "sid-x", introducedRunId: "run-init", introducedAt: "2026-05-01T00:00:00.000Z",
      reinforcementRuns: [], pushbackRuns: [], pastIncidentDates: [], crossReferenceCount: 0,
    }],
  }));
  try {
    const before = Date.now();
    await recordReinforcement({ agentId, runId: "run-now", citedSectionStableIds: ["sid-x"] });
    const after = Date.now();
    const data = JSON.parse(await fs.readFile(statePath(agentId), "utf8"));
    const sec = data.sections.find((s: any) => s.sectionId === "sid-x");
    const stamped = Date.parse(sec.lastReinforcedAt);
    // Allow a ±5s slack window; the timestamp must lie within or near the call window.
    assert.ok(stamped >= before - 5000 && stamped <= after + 5000,
      `lastReinforcedAt ${sec.lastReinforcedAt} not within [${before - 5000}, ${after + 5000}]`);
  } finally {
    await fs.rm(statePath(agentId), { force: true });
  }
});
