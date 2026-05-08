import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("recordReinforcement sets section.lastReinforcedAt", async () => {
  const agentId = `bh-lra-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  try {
    await recordReinforcement({
      agentId,
      runId: "run-x",
      citedSectionStableIds: ["stable-id-iii"],
    });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const section = (parsed.sections as Array<{ sectionId: string; lastReinforcedAt?: string }>)
      .find((s) => s.sectionId === "stable-id-iii");
    assert.ok(section);
    assert.equal(typeof section!.lastReinforcedAt, "string");
    assert.ok((section!.lastReinforcedAt ?? "").length > 0);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
