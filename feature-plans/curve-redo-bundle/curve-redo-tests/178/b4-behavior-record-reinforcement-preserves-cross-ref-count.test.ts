import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

const STATE_DIR = path.join(process.cwd(), "state");
const statePath = (id: string) => path.join(STATE_DIR, `lesson-utility-${id}.json`);
let _c = 0;
const uniq = () => `t-xref-${process.pid}-${Date.now()}-${++_c}`;

test("recordReinforcement does NOT clobber crossReferenceCount on cited section", async () => {
  const agentId = uniq();
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(statePath(agentId), JSON.stringify({
    agentId,
    schemaVersion: 1,
    sections: [{
      sectionId: "sid-x", introducedRunId: "run-init", introducedAt: "2026-05-01T00:00:00.000Z",
      reinforcementRuns: [], pushbackRuns: [], pastIncidentDates: [],
      crossReferenceCount: 7,
      crossReferenceUpdatedAt: "2026-05-04T00:00:00.000Z",
    }],
  }));
  try {
    await recordReinforcement({ agentId, runId: "rxx", citedSectionStableIds: ["sid-x"] });
    const data = JSON.parse(await fs.readFile(statePath(agentId), "utf8"));
    const sec = data.sections.find((s: any) => s.sectionId === "sid-x");
    assert.equal(sec.crossReferenceCount, 7, "crossReferenceCount must not be clobbered by reinforcement writes");
    assert.equal(sec.crossReferenceUpdatedAt, "2026-05-04T00:00:00.000Z");
  } finally {
    await fs.rm(statePath(agentId), { force: true });
  }
});
