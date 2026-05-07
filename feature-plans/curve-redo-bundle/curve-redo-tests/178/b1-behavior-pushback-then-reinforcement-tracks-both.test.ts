import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement, recordPushback } from "./lessonUtility.js";

test("pushback-first then reinforcement keeps both runIds segregated by event type", async () => {
  const agentId = `bh-pbthenrr-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  const stable = "stable-id-pbthenrr";
  try {
    await recordPushback({ agentId, runId: "run-pb-first", citedSectionStableIds: [stable] });
    await recordReinforcement({ agentId, runId: "run-rr-second", citedSectionStableIds: [stable] });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const section = (parsed.sections as Array<{
      sectionId: string;
      reinforcementRuns: string[];
      pushbackRuns: string[];
    }>).find((s) => s.sectionId === stable);
    assert.ok(section);
    assert.deepEqual(section!.pushbackRuns, ["run-pb-first"]);
    assert.deepEqual(section!.reinforcementRuns, ["run-rr-second"]);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
