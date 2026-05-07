// Edge case: empty input collection — calling recordReinforcement with
// no citations must not corrupt or modify the utility file. If the file
// did not exist, it should remain absent (or, if created, contain an
// empty sections array).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordReinforcement } from "./lessonUtility.js";

test("recordReinforcement: empty citedSectionStableIds is a no-op", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "vp-lu-"));
  await recordReinforcement({
    agentId: "agent-noop",
    runId: "run-noop",
    citedSectionStableIds: [],
    stateDir,
  });
  const filePath = join(stateDir, "lesson-utility-agent-noop.json");
  if (existsSync(filePath)) {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    const sections = parsed.sections ?? [];
    for (const s of sections) {
      const reinforced: string[] = s.reinforcementRuns ?? [];
      assert.equal(reinforced.includes("run-noop"), false);
    }
  }
});
