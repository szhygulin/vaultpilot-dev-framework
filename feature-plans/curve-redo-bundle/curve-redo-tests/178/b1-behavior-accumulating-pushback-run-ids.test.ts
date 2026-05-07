import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordPushback } from "./lessonUtility.js";

test("two recordPushback calls on the same stable id accumulate both runIds", async () => {
  const agentId = `bh-pbacc-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  const stable = "stable-id-pbacc";
  try {
    await recordPushback({ agentId, runId: "run-pb-A", citedSectionStableIds: [stable] });
    await recordPushback({ agentId, runId: "run-pb-B", citedSectionStableIds: [stable] });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const section = (parsed.sections as Array<{ sectionId: string; pushbackRuns: string[] }>)
      .find((s) => s.sectionId === stable);
    assert.ok(section);
    const sorted = [...section!.pushbackRuns].sort();
    assert.deepEqual(sorted, ["run-pb-A", "run-pb-B"]);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
