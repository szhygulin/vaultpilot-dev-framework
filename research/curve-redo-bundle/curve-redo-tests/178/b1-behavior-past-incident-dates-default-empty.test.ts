import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("a freshly-created SectionUtilityRecord has pastIncidentDates: []", async () => {
  const agentId = `bh-pid-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  try {
    await recordReinforcement({
      agentId,
      runId: "run-1",
      citedSectionStableIds: ["stable-id-fff"],
    });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const section = parsed.sections.find((s: { sectionId: string }) => s.sectionId === "stable-id-fff");
    assert.ok(section, "expected a section with sectionId stable-id-fff");
    assert.equal(Array.isArray(section.pastIncidentDates), true);
    assert.equal(section.pastIncidentDates.length, 0);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
