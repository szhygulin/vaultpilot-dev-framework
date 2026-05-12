// Missing errorSubtype renders 'unknown'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 render resume unknown default", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/prompt.ts"), "utf8");
  assert.match(src, /['"]unknown['"]/);
});
