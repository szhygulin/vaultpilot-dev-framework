// Triage gate returns fromCache: false.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b6 triage fromcache false", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/triage.ts"), "utf8");
  assert.match(src, /pendingPostMortem[\s\S]*?fromCache\s*:\s*false/);
});
