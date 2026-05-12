import { test } from "node:test";
import assert from "node:assert/strict";

test("claudeBinPath returns undefined or string", async () => {
  const mod: any = await import("./sdkBinary.js");
  const r = mod.claudeBinPath();
  assert.ok(r === undefined || typeof r === "string");
});
