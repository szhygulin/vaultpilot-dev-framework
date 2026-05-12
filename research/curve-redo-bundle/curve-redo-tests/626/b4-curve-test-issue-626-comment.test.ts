import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("test/curve-v1.test.ts references issue #626 in a comment", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  expect(src).toMatch(/#626/);
});
