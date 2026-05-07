import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

const STATE_DIR = path.join(process.cwd(), "state");
const statePath = (id: string) => path.join(STATE_DIR, `lesson-utility-${id}.json`);
let _c = 0;
const uniq = () => `t-rr-idem-${process.pid}-${Date.now()}-${++_c}`;

test("recordReinforcement is idempotent: calling twice with same runId does not duplicate", async () => {
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
    await recordReinforcement({ agentId, runId: "run-dup", citedSectionStableIds: ["sid-x"] });
    await recordReinforcement({ agentId, runId: "run-dup", citedSectionStableIds: ["sid-x"] });
    const data = JSON.parse(await fs.readFile(statePath(agentId), "utf8"));
    const sec = data.sections.find((s: any) => s.sectionId === "sid-x");
    const occurrences = sec.reinforcementRuns.filter((r: string) => r === "run-dup").length;
    assert.equal(occurrences, 1, "run-dup must appear exactly once across repeat calls");
  } finally {
    await fs.rm(statePath(agentId), { force: true });
  }
});
