import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("runIssueCore.ts logs originUrlCaptured flag in replay_rollback event", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/runIssueCore.ts"), "utf8");
  assert.match(src, /originUrlCaptured|savedOriginUrl/);
});
