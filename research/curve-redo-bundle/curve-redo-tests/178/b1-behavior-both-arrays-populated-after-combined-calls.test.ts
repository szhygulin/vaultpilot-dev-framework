import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement, recordPushback } from "./lessonUtility.js";

test("recordReinforcement + recordPushback on same section populate both arrays", async () => {
  const agentId = `bh-both-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  const stable = "stable-id-both";
  try {
    await recordReinforcement({ agentId, runId: "run-rr-1", citedSectionStableIds: [stable] });
    await recordPushback({ agentId, runId: "run-pb-1", citedSectionStableIds: [stable] });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const section = (parsed.sections as Array<{
      sectionId: string;
      reinforcementRuns: string[];
      pushbackRuns: string[];
    }>).find((s) => s.sectionId === stable);
    assert.ok(section);
    assert.deepEqual(section!.reinforcementRuns, ["run-rr-1"]);
    assert.deepEqual(section!.pushbackRuns, ["run-pb-1"]);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
