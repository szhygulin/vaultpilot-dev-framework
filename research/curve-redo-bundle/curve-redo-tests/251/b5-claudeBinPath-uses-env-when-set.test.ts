import { test } from "node:test";
import assert from "node:assert/strict";

test("claudeBinPath returns the env override when VP_DEV_CLAUDE_BIN is set", async () => {
  const mod: any = await import("./sdkBinary.js");
  const saved = process.env.VP_DEV_CLAUDE_BIN;
  process.env.VP_DEV_CLAUDE_BIN = "/tmp/test-claude-bin";
  try {
    const r = mod.claudeBinPath();
    assert.equal(r, "/tmp/test-claude-bin");
  } finally {
    if (saved !== undefined) process.env.VP_DEV_CLAUDE_BIN = saved;
    else delete process.env.VP_DEV_CLAUDE_BIN;
  }
});
