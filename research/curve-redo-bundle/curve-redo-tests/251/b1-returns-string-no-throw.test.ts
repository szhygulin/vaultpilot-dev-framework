import { test } from "node:test";
import assert from "node:assert/strict";

test("claudeBinPath returns a string and does not throw on default invocation", async () => {
  const mod: any = await import("./sdkBinary.js");
  // No env override set in test process (or whatever is set by harness).
  // We just verify the call doesn't throw and yields a string.
  const result = mod.claudeBinPath();
  assert.equal(typeof result, "string");
  assert.ok(result.length > 0);
});
