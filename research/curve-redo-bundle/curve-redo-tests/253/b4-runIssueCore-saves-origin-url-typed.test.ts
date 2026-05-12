import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("runIssueCore.ts declares savedOriginUrl with type annotation string|undefined", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/runIssueCore.ts"), "utf8");
  assert.match(src, /savedOriginUrl\s*:\s*string\s*\|\s*undefined|let\s+savedOriginUrl/);
});
