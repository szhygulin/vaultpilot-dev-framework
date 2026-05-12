// parseIssueIdFromBranch is exported.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 cli parse issue id from branch exported", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /export\s+function\s+parseIssueIdFromBranch\b/);
});
