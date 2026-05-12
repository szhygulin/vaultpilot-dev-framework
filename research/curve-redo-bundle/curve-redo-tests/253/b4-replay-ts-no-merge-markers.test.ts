import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("replay.ts has no leftover merge conflict markers", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  assert.doesNotMatch(src, /<<<<<<<|=======|>>>>>>>/);
});
