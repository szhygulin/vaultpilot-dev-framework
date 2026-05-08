import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordPushback } from "./lessonUtility.js";

const STATE_DIR = path.join(process.cwd(), "state");
const statePath = (id: string) => path.join(STATE_DIR, `lesson-utility-${id}.json`);
let _c = 0;
const uniq = () => `t-pb-last-${process.pid}-${Date.now()}-${++_c}`;

test("recordPushback updates lastReinforcedAt — issue: 'most recent of the above two events'", async () => {
  const agentId = uniq();
  // Pre-seed with a stale lastReinforcedAt to verify the value moves forward.
  const stale = "2020-01-01T00:00:00.000Z";
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(statePath(agentId), JSON.stringify({
    agentId,
    schemaVersion: 1,
    sections: [{
      sectionId: "sid-pbts", introducedRunId: "run-init", introducedAt: "2020-01-01T00:00:00.000Z",
      reinforcementRuns: [], pushbackRuns: [], pastIncidentDates: [], crossReferenceCount: 0,
      lastReinforcedAt: stale,
    }],
  }));
  try {
    await recordPushback({ agentId, runId: "run-pb-recent", citedSectionStableIds: ["sid-pbts"] });
    const data = JSON.parse(await fs.readFile(statePath(agentId), "utf8"));
    const sec = data.sections.find((s: any) => s.sectionId === "sid-pbts");
    assert.ok(typeof sec.lastReinforcedAt === "string");
    assert.notEqual(sec.lastReinforcedAt, stale, "lastReinforcedAt must move past the pre-seeded stale value");
    assert.ok(Date.parse(sec.lastReinforcedAt) > Date.parse(stale));
  } finally {
    await fs.rm(statePath(agentId), { force: true });
  }
});
