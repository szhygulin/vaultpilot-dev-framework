import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("originUrl assignment coalesces empty string to undefined", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  assert.match(src, /trim\(\)\s*\|\|\s*undefined|\?\s*[^:]+:\s*undefined/);
});
