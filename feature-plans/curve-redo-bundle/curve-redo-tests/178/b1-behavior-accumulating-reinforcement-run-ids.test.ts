import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("two recordReinforcement calls on the same stable id accumulate both runIds", async () => {
  const agentId = `bh-accrr-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  const stable = "stable-id-acc";
  try {
    await recordReinforcement({ agentId, runId: "run-A", citedSectionStableIds: [stable] });
    await recordReinforcement({ agentId, runId: "run-B", citedSectionStableIds: [stable] });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const section = (parsed.sections as Array<{ sectionId: string; reinforcementRuns: string[] }>)
      .find((s) => s.sectionId === stable);
    assert.ok(section);
    const sorted = [...section!.reinforcementRuns].sort();
    assert.deepEqual(sorted, ["run-A", "run-B"]);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
