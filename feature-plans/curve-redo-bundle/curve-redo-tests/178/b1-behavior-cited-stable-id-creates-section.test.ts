import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("recordReinforcement creates a SectionUtilityRecord keyed by the cited stable id", async () => {
  const agentId = `bh-cited-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  const stable = "stable-id-ggg-12345";
  try {
    await recordReinforcement({
      agentId,
      runId: "run-init",
      citedSectionStableIds: [stable],
    });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const ids = (parsed.sections as Array<{ sectionId: string }>).map((s) => s.sectionId);
    assert.ok(ids.includes(stable), `expected sectionId ${stable} in ${JSON.stringify(ids)}`);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
