import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("section.sectionId in the persisted file equals the stable id passed in", async () => {
  const agentId = `bh-rt-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  const stable = "abc123def456-stable-id-with-dashes";
  try {
    await recordReinforcement({
      agentId,
      runId: "run-rt",
      citedSectionStableIds: [stable],
    });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const section = (parsed.sections as Array<{ sectionId: string }>).find((s) => s.sectionId === stable);
    assert.ok(section, `expected sectionId === ${stable}`);
    assert.equal(section!.sectionId, stable);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
