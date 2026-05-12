import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("replay.test.ts asserts post-strip 'git remote get-url origin' rejects", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.test.ts"), "utf8");
  assert.match(src, /assert\.rejects[\s\S]*?get-url[\s\S]*?origin|No such remote/);
});
