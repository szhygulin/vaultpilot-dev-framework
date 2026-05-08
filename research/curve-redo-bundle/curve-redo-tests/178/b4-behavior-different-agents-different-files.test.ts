import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

const STATE_DIR = path.join(process.cwd(), "state");
const statePath = (id: string) => path.join(STATE_DIR, `lesson-utility-${id}.json`);
let _c = 0;
const uniq = (tag: string) => `t-${tag}-${process.pid}-${Date.now()}-${++_c}`;

test("different agentIds → different files; recordReinforcement is isolated per agent", async () => {
  const a = uniq("agA");
  const b = uniq("agB");
  await fs.mkdir(STATE_DIR, { recursive: true });
  for (const id of [a, b]) {
    await fs.writeFile(statePath(id), JSON.stringify({
      agentId: id,
      schemaVersion: 1,
      sections: [{
        sectionId: "sid-shared", introducedRunId: "run-init", introducedAt: "2026-05-01T00:00:00.000Z",
        reinforcementRuns: [], pushbackRuns: [], pastIncidentDates: [], crossReferenceCount: 0,
      }],
    }));
  }
  try {
    await recordReinforcement({ agentId: a, runId: "only-a", citedSectionStableIds: ["sid-shared"] });
    const dataA = JSON.parse(await fs.readFile(statePath(a), "utf8"));
    const dataB = JSON.parse(await fs.readFile(statePath(b), "utf8"));
    assert.deepEqual(dataA.sections.find((s: any) => s.sectionId === "sid-shared").reinforcementRuns, ["only-a"]);
    assert.deepEqual(dataB.sections.find((s: any) => s.sectionId === "sid-shared").reinforcementRuns, [],
      "agent B's file must be untouched by writes targeting agent A");
  } finally {
    await fs.rm(statePath(a), { force: true });
    await fs.rm(statePath(b), { force: true });
  }
});
