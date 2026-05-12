// The PR diff added explanatory comments naming Issue #626 inside the
// test file too.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("test/curve-v1.test.ts comment links to issue #626", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  expect(src).toMatch(/#626/);
});
