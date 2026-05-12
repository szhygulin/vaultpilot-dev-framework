import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("the existing #245 preflight rationale comment is not gutted", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  // Look for at least one block comment of meaningful length.
  const blocks = src.match(/\/\*\*[\s\S]+?\*\//g) ?? [];
  const longBlocks = blocks.filter((b) => b.length > 200);
  assert.ok(longBlocks.length >= 1, "docblock context appears stripped");
});
