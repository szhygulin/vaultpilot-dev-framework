import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("replay.ts has no obvious TODO near the new restore function", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  const fnIdx = src.indexOf("function restoreOriginRemote");
  if (fnIdx > 0) {
    const window = src.slice(Math.max(0, fnIdx - 200), fnIdx + 800);
    assert.doesNotMatch(window, /TODO\s*:.*restore|FIXME.*restore/);
  }
});
