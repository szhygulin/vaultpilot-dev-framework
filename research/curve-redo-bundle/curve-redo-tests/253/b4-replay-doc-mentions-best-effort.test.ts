import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("replay.ts doc-block describes the restore as best-effort / idempotent", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  assert.match(src, /best-effort|idempotent/i);
});
