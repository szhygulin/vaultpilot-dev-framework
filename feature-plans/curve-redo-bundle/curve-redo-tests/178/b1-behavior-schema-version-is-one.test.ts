import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("persisted AgentUtilityFile has schemaVersion: 1", async () => {
  const agentId = `bh-ver-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  try {
    await recordReinforcement({
      agentId,
      runId: "run-1",
      citedSectionStableIds: ["stable-id-ccc"],
    });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(parsed.schemaVersion, 1);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
