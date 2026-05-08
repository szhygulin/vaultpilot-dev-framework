import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("two distinct agentIds produce two distinct state files", async () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const agentA = `bh-agA-${stamp}`;
  const agentB = `bh-agB-${stamp}`;
  const fileA = path.join(process.cwd(), "state", `lesson-utility-${agentA}.json`);
  const fileB = path.join(process.cwd(), "state", `lesson-utility-${agentB}.json`);
  try {
    await recordReinforcement({ agentId: agentA, runId: "run-a", citedSectionStableIds: ["sid-A"] });
    await recordReinforcement({ agentId: agentB, runId: "run-b", citedSectionStableIds: ["sid-B"] });
    assert.equal(existsSync(fileA), true);
    assert.equal(existsSync(fileB), true);
    const a = JSON.parse(readFileSync(fileA, "utf8"));
    const b = JSON.parse(readFileSync(fileB, "utf8"));
    assert.equal(a.agentId, agentA);
    assert.equal(b.agentId, agentB);
    assert.notEqual(a.agentId, b.agentId);
  } finally {
    if (existsSync(fileA)) rmSync(fileA);
    if (existsSync(fileB)) rmSync(fileB);
  }
});
