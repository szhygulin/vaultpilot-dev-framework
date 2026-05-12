import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("curve-v1.test.ts still uses expect() assertions", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  expect(src).toMatch(/\bexpect\(/);
});
