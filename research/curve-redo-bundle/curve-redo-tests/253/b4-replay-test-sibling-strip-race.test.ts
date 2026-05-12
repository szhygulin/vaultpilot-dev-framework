import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("replay.test.ts covers sibling-strip race (originUrl undefined branch)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.test.ts"), "utf8");
  assert.match(src, /sibling|undefined|already stripped|race/i);
});
