import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordPushback } from "./lessonUtility.js";

test("after only recordPushback, section.reinforcementRuns is []", async () => {
  const agentId = `bh-rrempty-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  try {
    await recordPushback({
      agentId,
      runId: "run-pb-Z",
      citedSectionStableIds: ["stable-id-pb-ddd"],
    });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const section = (parsed.sections as Array<{ sectionId: string; reinforcementRuns: string[] }>)
      .find((s) => s.sectionId === "stable-id-pb-ddd");
    assert.ok(section);
    assert.equal(Array.isArray(section!.reinforcementRuns), true);
    assert.equal(section!.reinforcementRuns.length, 0);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
