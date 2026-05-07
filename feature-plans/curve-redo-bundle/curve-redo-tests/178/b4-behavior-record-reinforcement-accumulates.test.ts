import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

const STATE_DIR = path.join(process.cwd(), "state");
const statePath = (id: string) => path.join(STATE_DIR, `lesson-utility-${id}.json`);
let _c = 0;
const uniq = () => `t-rr-acc-${process.pid}-${Date.now()}-${++_c}`;

test("successive recordReinforcement calls accumulate distinct runIds", async () => {
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
    await recordReinforcement({ agentId, runId: "run-1", citedSectionStableIds: ["sid-x"] });
    await recordReinforcement({ agentId, runId: "run-2", citedSectionStableIds: ["sid-x"] });
    await recordReinforcement({ agentId, runId: "run-3", citedSectionStableIds: ["sid-x"] });
    const data = JSON.parse(await fs.readFile(statePath(agentId), "utf8"));
    const sec = data.sections.find((s: any) => s.sectionId === "sid-x");
    assert.equal(sec.reinforcementRuns.length, 3);
    const set = new Set<string>(sec.reinforcementRuns);
    assert.ok(set.has("run-1"));
    assert.ok(set.has("run-2"));
    assert.ok(set.has("run-3"));
  } finally {
    await fs.rm(statePath(agentId), { force: true });
  }
});
