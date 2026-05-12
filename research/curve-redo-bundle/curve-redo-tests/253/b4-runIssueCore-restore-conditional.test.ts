import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("runIssueCore.ts guards restore on savedOriginUrl presence", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/runIssueCore.ts"), "utf8");
  // either `if (savedOriginUrl ...)` or short-circuit
  assert.match(src, /if\s*\(\s*savedOriginUrl|savedOriginUrl\s*&&/);
});
