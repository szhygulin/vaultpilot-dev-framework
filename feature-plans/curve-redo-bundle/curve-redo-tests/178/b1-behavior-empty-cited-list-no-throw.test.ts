import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("recordReinforcement with an empty citedSectionStableIds resolves without throwing", async () => {
  const agentId = `bh-empty-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  try {
    await recordReinforcement({
      agentId,
      runId: "run-empty",
      citedSectionStableIds: [],
    });
    // No assertion on file existence — fail-soft, may or may not write.
    assert.ok(true);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
