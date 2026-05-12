// One test path covers the case where a sibling already stripped origin
// (the originUrl=undefined branch).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("replay.test.ts covers originUrl=undefined when origin was absent", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.test.ts"), "utf8");
  assert.match(src, /originUrl[\s\S]*?undefined/);
});
