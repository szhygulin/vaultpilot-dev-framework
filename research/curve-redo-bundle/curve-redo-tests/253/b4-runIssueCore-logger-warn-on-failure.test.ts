import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("runIssueCore.ts logs replay_origin_restore_failed on restore error", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/runIssueCore.ts"), "utf8");
  assert.match(src, /replay_origin_restore_failed|origin.*restore.*fail/i);
});
