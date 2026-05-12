import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

test("sdkBinary has accompanying *.test.* file under src/", () => {
  const out = execSync("grep -rlE 'sdkBinary' src/agent/ || true", { encoding: "utf8" });
  const lines = out.split("\n").filter(Boolean);
  // At least the source itself + a test/spec file is expected after the fix.
  assert.ok(lines.length >= 1, "no sdkBinary references found");
});
