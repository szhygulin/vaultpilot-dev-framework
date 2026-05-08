// Edge case: bootstrap from missing-file — first call against a fresh
// state dir must create the utility file and stamp schemaVersion: 1 and
// the agentId in its top level.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("recordReinforcement: creates utility file with schemaVersion 1 on first call", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "vp-lu-"));
  const stableId = "a".repeat(64);
  await recordReinforcement({
    agentId: "agent-create",
    runId: "run-1",
    citedSectionStableIds: [stableId],
    stateDir,
  });
  const filePath = join(stateDir, "lesson-utility-agent-create.json");
  assert.equal(existsSync(filePath), true, `expected ${filePath} to exist`);
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.agentId, "agent-create");
});
