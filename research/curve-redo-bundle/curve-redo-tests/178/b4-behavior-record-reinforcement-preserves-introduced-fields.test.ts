import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

const STATE_DIR = path.join(process.cwd(), "state");
const statePath = (id: string) => path.join(STATE_DIR, `lesson-utility-${id}.json`);
let _c = 0;
const uniq = () => `t-intr-${process.pid}-${Date.now()}-${++_c}`;

test("recordReinforcement preserves introducedRunId and introducedAt", async () => {
  const agentId = uniq();
  const introducedRunId = "run-introduced-original";
  const introducedAt = "2026-04-15T08:30:00.000Z";
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(statePath(agentId), JSON.stringify({
    agentId,
    schemaVersion: 1,
    sections: [{
      sectionId: "sid-i", introducedRunId, introducedAt,
      reinforcementRuns: [], pushbackRuns: [], pastIncidentDates: [], crossReferenceCount: 0,
    }],
  }));
  try {
    await recordReinforcement({ agentId, runId: "r1", citedSectionStableIds: ["sid-i"] });
    const data = JSON.parse(await fs.readFile(statePath(agentId), "utf8"));
    const sec = data.sections.find((s: any) => s.sectionId === "sid-i");
    assert.equal(sec.introducedRunId, introducedRunId);
    assert.equal(sec.introducedAt, introducedAt);
  } finally {
    await fs.rm(statePath(agentId), { force: true });
  }
});
