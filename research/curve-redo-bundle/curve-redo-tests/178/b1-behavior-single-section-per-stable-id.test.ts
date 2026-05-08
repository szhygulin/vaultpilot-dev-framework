import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("repeated reinforcement of the same stable id does not duplicate the section record", async () => {
  const agentId = `bh-single-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  const stable = "stable-id-once";
  try {
    await recordReinforcement({ agentId, runId: "run-1", citedSectionStableIds: [stable] });
    await recordReinforcement({ agentId, runId: "run-2", citedSectionStableIds: [stable] });
    await recordReinforcement({ agentId, runId: "run-3", citedSectionStableIds: [stable] });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const matching = (parsed.sections as Array<{ sectionId: string }>).filter((s) => s.sectionId === stable);
    assert.equal(matching.length, 1);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
