// Iterates pending → markAborted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 orch loop mark aborted", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/orchestrator.ts"), "utf8");
  assert.match(src, /for\s*\(\s*const\s+id\s+of\s+stillPending\s*\)\s*markAborted/);
});
