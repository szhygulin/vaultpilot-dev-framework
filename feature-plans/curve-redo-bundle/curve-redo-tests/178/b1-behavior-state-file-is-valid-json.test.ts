import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("state file written by recordReinforcement is valid JSON", async () => {
  const agentId = `bh-json-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  try {
    await recordReinforcement({
      agentId,
      runId: "run-1",
      citedSectionStableIds: ["stable-id-bbb"],
    });
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(typeof parsed, "object");
    assert.notEqual(parsed, null);
    assert.equal(Array.isArray(parsed), false);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
