import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("sdkBinary still imports from node:fs", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /from\s+["']node:fs["']|require\(["']node:fs["']\)|require\(["']fs["']\)|from\s+["']fs["']/);
});
