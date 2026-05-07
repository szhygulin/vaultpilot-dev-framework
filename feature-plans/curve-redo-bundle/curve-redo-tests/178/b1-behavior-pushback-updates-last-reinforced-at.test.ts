import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordPushback } from "./lessonUtility.js";

test("recordPushback sets section.lastReinforcedAt to a parseable ISO string", async () => {
  const agentId = `bh-pblra-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  const before = Date.now();
  try {
    await recordPushback({
      agentId,
      runId: "run-pb-Q",
      citedSectionStableIds: ["stable-id-pb-ccc"],
    });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const section = (parsed.sections as Array<{ sectionId: string; lastReinforcedAt?: string }>)
      .find((s) => s.sectionId === "stable-id-pb-ccc");
    assert.ok(section);
    assert.equal(typeof section!.lastReinforcedAt, "string");
    const ms = Date.parse(section!.lastReinforcedAt!);
    assert.equal(Number.isNaN(ms), false);
    assert.ok(ms >= before - 60_000);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
