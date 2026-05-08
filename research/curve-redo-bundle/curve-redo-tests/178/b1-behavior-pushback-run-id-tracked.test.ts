import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordPushback } from "./lessonUtility.js";

test("recordPushback appends runId to section.pushbackRuns", async () => {
  const agentId = `bh-pbtrack-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  try {
    await recordPushback({
      agentId,
      runId: "run-pb-XYZ",
      citedSectionStableIds: ["stable-id-pb-bbb"],
    });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const section = (parsed.sections as Array<{ sectionId: string; pushbackRuns: string[] }>)
      .find((s) => s.sectionId === "stable-id-pb-bbb");
    assert.ok(section);
    assert.deepEqual(section!.pushbackRuns, ["run-pb-XYZ"]);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
