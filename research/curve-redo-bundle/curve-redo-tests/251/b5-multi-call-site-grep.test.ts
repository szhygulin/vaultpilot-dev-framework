import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

test("claudeBinPath has at least one consumer in src/", () => {
  const out = execSync("grep -rIl 'claudeBinPath' src/ || true", { encoding: "utf8" });
  assert.ok(out.split("\n").filter(Boolean).length >= 1, "no claudeBinPath consumer found");
});
