import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("preflight hint references the glibc binary path", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /claude-agent-sdk-linux-x64["']?\b|glibcBin|glibc claude/i);
});
