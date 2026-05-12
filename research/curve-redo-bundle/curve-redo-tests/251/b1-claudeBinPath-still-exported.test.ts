import { test } from "node:test";
import assert from "node:assert/strict";

test("claudeBinPath is still exported from sdkBinary.js", async () => {
  const mod: any = await import("./sdkBinary.js");
  assert.equal(typeof mod.claudeBinPath, "function");
});
