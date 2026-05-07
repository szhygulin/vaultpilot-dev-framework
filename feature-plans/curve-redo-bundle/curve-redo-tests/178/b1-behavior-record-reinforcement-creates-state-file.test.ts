import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("recordReinforcement creates the per-agent state file at the expected path", async () => {
  const agentId = `bh-create-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  try {
    await recordReinforcement({
      agentId,
      runId: "run-1",
      citedSectionStableIds: ["stable-id-aaa"],
    });
    assert.equal(existsSync(file), true, `expected state file at ${file}`);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
