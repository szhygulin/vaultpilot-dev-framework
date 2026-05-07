import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("section.lastReinforcedAt is an ISO 8601 timestamp", async () => {
  const agentId = `bh-iso-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const file = path.join(process.cwd(), "state", `lesson-utility-${agentId}.json`);
  const before = Date.now();
  try {
    await recordReinforcement({
      agentId,
      runId: "run-iso",
      citedSectionStableIds: ["stable-id-jjj"],
    });
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const section = (parsed.sections as Array<{ sectionId: string; lastReinforcedAt?: string }>)
      .find((s) => s.sectionId === "stable-id-jjj");
    assert.ok(section);
    const ts = section!.lastReinforcedAt;
    assert.equal(typeof ts, "string");
    // ISO 8601 format with Z or offset; Date.parse should succeed.
    const ms = Date.parse(ts!);
    assert.equal(Number.isNaN(ms), false, `lastReinforcedAt is not parseable: ${ts}`);
    // Sanity: at least within a generous window of "now".
    assert.ok(ms >= before - 60_000);
    assert.ok(ms <= Date.now() + 60_000);
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});
