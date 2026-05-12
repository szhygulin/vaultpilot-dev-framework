// renderResumeBlock suggests `git log` to inspect prior commits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 render resume git log hint", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/prompt.ts"), "utf8");
  assert.match(src, /git\s+log\s+--oneline\s+origin\/main\.\.HEAD/);
});
