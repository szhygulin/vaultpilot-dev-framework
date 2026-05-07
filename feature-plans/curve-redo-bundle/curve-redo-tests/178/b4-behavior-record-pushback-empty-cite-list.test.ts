import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordPushback } from "./lessonUtility.js";

const STATE_DIR = path.join(process.cwd(), "state");
const statePath = (id: string) => path.join(STATE_DIR, `lesson-utility-${id}.json`);
let _c = 0;
const uniq = () => `t-pb-empty-${process.pid}-${Date.now()}-${++_c}`;

test("recordPushback with empty citedSectionStableIds is fail-soft (no throw)", async () => {
  const agentId = uniq();
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(statePath(agentId), JSON.stringify({
    agentId,
    schemaVersion: 1,
    sections: [{
      sectionId: "sid-pe", introducedRunId: "run-init", introducedAt: "2026-05-01T00:00:00.000Z",
      reinforcementRuns: [], pushbackRuns: ["existing-pb"], pastIncidentDates: [], crossReferenceCount: 0,
    }],
  }));
  try {
    await assert.doesNotReject(
      recordPushback({ agentId, runId: "run-empty-pb", citedSectionStableIds: [] }),
      "empty cite list must not throw — pushback hook is fire-and-forget / fail-soft",
    );
    const data = JSON.parse(await fs.readFile(statePath(agentId), "utf8"));
    const sec = data.sections.find((s: any) => s.sectionId === "sid-pe");
    assert.deepEqual(sec.pushbackRuns, ["existing-pb"]);
  } finally {
    await fs.rm(statePath(agentId), { force: true });
  }
});
