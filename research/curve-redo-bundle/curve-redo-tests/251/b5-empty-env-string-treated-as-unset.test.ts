import { test } from "node:test";
import assert from "node:assert/strict";

test("empty VP_DEV_CLAUDE_BIN is treated as unset (falsy)", async () => {
  const mod: any = await import("./sdkBinary.js");
  const saved = process.env.VP_DEV_CLAUDE_BIN;
  process.env.VP_DEV_CLAUDE_BIN = "";
  try {
    const r = mod.claudeBinPath();
    // Empty string should not be returned as the path; either undefined or auto-detect.
    assert.notEqual(r, "");
  } finally {
    if (saved !== undefined) process.env.VP_DEV_CLAUDE_BIN = saved;
    else delete process.env.VP_DEV_CLAUDE_BIN;
  }
});
