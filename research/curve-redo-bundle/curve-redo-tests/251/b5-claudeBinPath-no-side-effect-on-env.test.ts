import { test } from "node:test";
import assert from "node:assert/strict";

test("claudeBinPath does not mutate VP_DEV_CLAUDE_BIN env var", async () => {
  const mod: any = await import("./sdkBinary.js");
  const before = process.env.VP_DEV_CLAUDE_BIN;
  mod.claudeBinPath();
  assert.equal(process.env.VP_DEV_CLAUDE_BIN, before);
});
