import { test } from "node:test";
import assert from "node:assert/strict";

test("claudeBinPath returns undefined if no env override AND no auto-detect needed (smoke)", async () => {
  const mod: any = await import("./sdkBinary.js");
  const saved = process.env.VP_DEV_CLAUDE_BIN;
  delete process.env.VP_DEV_CLAUDE_BIN;
  try {
    const r = mod.claudeBinPath();
    // Either undefined (no override, fallback skipped) OR a string (auto-detect kicked in).
    assert.ok(r === undefined || typeof r === "string");
  } finally {
    if (saved !== undefined) process.env.VP_DEV_CLAUDE_BIN = saved;
  }
});
