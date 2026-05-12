import { test, expect } from "vitest";
import { existsSync } from "node:fs";
test("package.json present (vitest can resolve framework)", () => {
  expect(existsSync("package.json")).toBe(true);
});
