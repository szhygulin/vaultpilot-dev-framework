import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("PreflightSdkResult union retains ok:true and ok:false branches", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /ok:\s*true/);
  assert.match(src, /ok:\s*false/);
});
