import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("test/curve-v1.test.ts is at least 100 lines (substantive)", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  expect(src.split("\n").length).toBeGreaterThan(100);
});
