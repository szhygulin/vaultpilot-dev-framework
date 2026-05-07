import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

const STATE_DIR = path.join(process.cwd(), "state");
const statePath = (id: string) => path.join(STATE_DIR, `lesson-utility-${id}.json`);
let _c = 0;
const uniq = () => `t-iso-${process.pid}-${Date.now()}-${++_c}`;

test("lastReinforcedAt is an ISO 8601 timestamp parseable by Date", async () => {
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
    await recordReinforcement({ agentId, runId: "run-iso", citedSectionStableIds: ["sid-x"] });
    const data = JSON.parse(await fs.readFile(statePath(agentId), "utf8"));
    const sec = data.sections.find((s: any) => s.sectionId === "sid-x");
    const ts = sec.lastReinforcedAt as string;
    assert.equal(typeof ts, "string");
    const parsed = Date.parse(ts);
    assert.ok(Number.isFinite(parsed), `lastReinforcedAt should parse as a Date, got: ${ts}`);
    // ISO 8601 strings have a 'T' separating date and time.
    assert.ok(ts.includes("T"), `lastReinforcedAt should be ISO 8601 with 'T' separator, got: ${ts}`);
  } finally {
    await fs.rm(statePath(agentId), { force: true });
  }
});
