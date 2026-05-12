// Make sure no leftover .only filters in the test file.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("curve-v1.test.ts has no leftover it.only or describe.only", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  expect(src).not.toMatch(/\b(it|describe|test)\.only\(/);
});
