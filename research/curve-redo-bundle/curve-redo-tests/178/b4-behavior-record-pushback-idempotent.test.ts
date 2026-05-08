import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordPushback } from "./lessonUtility.js";

const STATE_DIR = path.join(process.cwd(), "state");
const statePath = (id: string) => path.join(STATE_DIR, `lesson-utility-${id}.json`);
let _c = 0;
const uniq = () => `t-pb-idem-${process.pid}-${Date.now()}-${++_c}`;

test("recordPushback duplicate runId is not double-appended", async () => {
  const agentId = uniq();
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(statePath(agentId), JSON.stringify({
    agentId,
    schemaVersion: 1,
    sections: [{
      sectionId: "sid-d", introducedRunId: "run-init", introducedAt: "2026-05-01T00:00:00.000Z",
      reinforcementRuns: [], pushbackRuns: [], pastIncidentDates: [], crossReferenceCount: 0,
    }],
  }));
  try {
    await recordPushback({ agentId, runId: "pb-dup", citedSectionStableIds: ["sid-d"] });
    await recordPushback({ agentId, runId: "pb-dup", citedSectionStableIds: ["sid-d"] });
    const data = JSON.parse(await fs.readFile(statePath(agentId), "utf8"));
    const sec = data.sections.find((s: any) => s.sectionId === "sid-d");
    const occ = sec.pushbackRuns.filter((r: string) => r === "pb-dup").length;
    assert.equal(occ, 1, "pb-dup must appear exactly once across repeat calls");
  } finally {
    await fs.rm(statePath(agentId), { force: true });
  }
});
