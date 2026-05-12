// flatMap walks rows OR skip union.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 flat map rows and skip", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/r\.kind\s*===\s*["']rows["']/);
});
