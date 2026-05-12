// renderResumeBlock truncates finalText to ~120 chars.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 render resume truncate final text", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/prompt.ts"), "utf8");
  assert.match(src, /slice\s*\(\s*0\s*,\s*120\s*\)/);
});
