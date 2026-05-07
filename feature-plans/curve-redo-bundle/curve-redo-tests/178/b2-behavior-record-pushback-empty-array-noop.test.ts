// Edge case: empty input collection — recordPushback with no cited
// sections must not invent any pushback bookkeeping for the runId.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordPushback } from "./lessonUtility.js";

test("recordPushback: empty citedSectionStableIds is a no-op", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "vp-lu-"));
  await recordPushback({
    agentId: "agent-pb-noop",
    runId: "run-pb-noop",
    citedSectionStableIds: [],
    stateDir,
  });
  const filePath = join(stateDir, "lesson-utility-agent-pb-noop.json");
  if (existsSync(filePath)) {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    const sections = parsed.sections ?? [];
    for (const s of sections) {
      const pushed: string[] = s.pushbackRuns ?? [];
      assert.equal(pushed.includes("run-pb-noop"), false);
    }
  }
});
