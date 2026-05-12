import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("applyReplayRollback captures via `git remote get-url origin`", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  assert.match(src, /"remote",\s*"get-url",\s*"origin"/);
});
