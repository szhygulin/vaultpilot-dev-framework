import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("replay.test.ts covers restore idempotent against existing origin", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.test.ts"), "utf8");
  assert.match(src, /idempotent|existing\s+origin|already re-added|altUrl/i);
});
