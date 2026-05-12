// Both artifact paths must be referenced by the auto-detect logic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("sdkBinary references both glibc and musl artifact paths", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /claude-agent-sdk-linux-x64\b/);
  assert.match(src, /claude-agent-sdk-linux-x64-musl/);
});
