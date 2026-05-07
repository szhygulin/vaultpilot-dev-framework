import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

const STATE_DIR = path.join(process.cwd(), "state");
const statePath = (id: string) => path.join(STATE_DIR, `lesson-utility-${id}.json`);
let _c = 0;
const uniq = () => `t-json-${process.pid}-${Date.now()}-${++_c}`;

test("state file is valid JSON after recordReinforcement", async () => {
  const agentId = uniq();
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(statePath(agentId), JSON.stringify({
    agentId,
    schemaVersion: 1,
    sections: [{
      sectionId: "sid-j", introducedRunId: "run-init", introducedAt: "2026-05-01T00:00:00.000Z",
      reinforcementRuns: [], pushbackRuns: [], pastIncidentDates: [], crossReferenceCount: 0,
    }],
  }));
  try {
    await recordReinforcement({ agentId, runId: "rj", citedSectionStableIds: ["sid-j"] });
    const text = await fs.readFile(statePath(agentId), "utf8");
    let parsed: any;
    assert.doesNotThrow(() => { parsed = JSON.parse(text); }, "state file must be valid JSON");
    assert.equal(typeof parsed, "object");
    assert.ok(parsed !== null);
  } finally {
    await fs.rm(statePath(agentId), { force: true });
  }
});
