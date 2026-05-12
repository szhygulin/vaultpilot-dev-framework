// renderResumeBlock returns string.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 render resume block returns string", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/prompt.ts"), "utf8");
  assert.match(src, /renderResumeBlock[\s\S]*?:\s*string\b/);
});
