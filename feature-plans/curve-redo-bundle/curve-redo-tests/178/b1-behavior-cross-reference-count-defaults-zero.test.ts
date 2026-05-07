import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("a freshly-created SectionUtilityRecord has crossReferenceCount: 0", async () => {
  const agentId = `bh-xref-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  try {
    await recordReinforcement({
      agentId,
      runId: "run-x",
      citedSectionStableIds: ["stable-id-kkk"],
    });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const section = (parsed.sections as Array<{ sectionId: string; crossReferenceCount: number }>)
      .find((s) => s.sectionId === "stable-id-kkk");
    assert.ok(section);
    assert.equal(section!.crossReferenceCount, 0);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
