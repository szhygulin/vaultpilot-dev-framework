import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("reinforcementRuns contains the runId that cited the section", async () => {
  const agentId = `bh-rrid-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  try {
    await recordReinforcement({
      agentId,
      runId: "run-cite-001",
      citedSectionStableIds: ["stable-id-hhh"],
    });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const section = (parsed.sections as Array<{ sectionId: string; reinforcementRuns: string[] }>)
      .find((s) => s.sectionId === "stable-id-hhh");
    assert.ok(section);
    assert.deepEqual(section!.reinforcementRuns, ["run-cite-001"]);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
