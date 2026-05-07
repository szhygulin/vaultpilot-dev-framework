import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

const STATE_DIR = path.join(process.cwd(), "state");
const statePath = (id: string) => path.join(STATE_DIR, `lesson-utility-${id}.json`);
let _c = 0;
const uniq = () => `t-rr-multi-${process.pid}-${Date.now()}-${++_c}`;
function baseSec(id: string) {
  return { sectionId: id, introducedRunId: "run-init", introducedAt: "2026-05-01T00:00:00.000Z", reinforcementRuns: [], pushbackRuns: [], pastIncidentDates: [], crossReferenceCount: 0 };
}

test("recordReinforcement updates every cited section, not just the first", async () => {
  const agentId = uniq();
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(statePath(agentId), JSON.stringify({
    agentId,
    schemaVersion: 1,
    sections: [baseSec("sid-aaa"), baseSec("sid-bbb"), baseSec("sid-ccc")],
  }));
  try {
    await recordReinforcement({
      agentId,
      runId: "run-multi",
      citedSectionStableIds: ["sid-aaa", "sid-ccc"],
    });
    const data = JSON.parse(await fs.readFile(statePath(agentId), "utf8"));
    const get = (id: string) => data.sections.find((s: any) => s.sectionId === id);
    assert.deepEqual(get("sid-aaa").reinforcementRuns, ["run-multi"]);
    assert.deepEqual(get("sid-ccc").reinforcementRuns, ["run-multi"]);
    assert.deepEqual(get("sid-bbb").reinforcementRuns, [], "non-cited section must remain untouched");
  } finally {
    await fs.rm(statePath(agentId), { force: true });
  }
});
