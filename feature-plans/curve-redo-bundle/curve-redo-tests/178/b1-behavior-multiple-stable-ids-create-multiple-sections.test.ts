import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("recordReinforcement with three cited stable ids creates three section records", async () => {
  const agentId = `bh-multi-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  const ids = ["stable-id-a1", "stable-id-a2", "stable-id-a3"];
  try {
    await recordReinforcement({
      agentId,
      runId: "run-multi",
      citedSectionStableIds: ids,
    });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const got = (parsed.sections as Array<{ sectionId: string }>).map((s) => s.sectionId).sort();
    assert.deepEqual(got, [...ids].sort());
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
