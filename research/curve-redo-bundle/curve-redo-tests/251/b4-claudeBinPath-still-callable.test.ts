import { test } from "node:test";
import assert from "node:assert/strict";

test("claudeBinPath is callable with no arguments", async () => {
  const mod: any = await import("./sdkBinary.js");
  const v = mod.claudeBinPath();
  assert.equal(typeof v, "string");
});
