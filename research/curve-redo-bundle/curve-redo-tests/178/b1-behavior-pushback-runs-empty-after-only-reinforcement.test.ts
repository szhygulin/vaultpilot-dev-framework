import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("after only recordReinforcement, section.pushbackRuns is []", async () => {
  const agentId = `bh-pbempty-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  try {
    await recordReinforcement({
      agentId,
      runId: "run-y",
      citedSectionStableIds: ["stable-id-lll"],
    });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const section = (parsed.sections as Array<{ sectionId: string; pushbackRuns: string[] }>)
      .find((s) => s.sectionId === "stable-id-lll");
    assert.ok(section);
    assert.equal(Array.isArray(section!.pushbackRuns), true);
    assert.equal(section!.pushbackRuns.length, 0);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
