// aborted-budget literal in IssueStatus.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 aborted budget string literal", () => {
  const src = readFileSync(resolve(process.cwd(), "src/types.ts"), "utf8");
  assert.match(src, /[|]\s*["']aborted-budget["']/);
});
