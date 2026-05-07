import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { recordPushback } from "./lessonUtility.js";

test("recordPushback creates the per-agent state file at the expected path", async () => {
  const agentId = `bh-pbcreate-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  try {
    await recordPushback({
      agentId,
      runId: "run-pb-1",
      citedSectionStableIds: ["stable-id-pb-aaa"],
    });
    assert.equal(existsSync(file), true, `expected state file at ${file}`);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
