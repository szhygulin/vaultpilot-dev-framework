import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("ApplyReplayRollbackResult has originUrl field (optional string)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  // Inside the interface declaration, originUrl is declared.
  const ifaceIdx = src.indexOf("ApplyReplayRollbackResult");
  assert.ok(ifaceIdx >= 0);
  const window = src.slice(ifaceIdx, ifaceIdx + 600);
  assert.match(window, /originUrl\??\s*:\s*string/);
});
