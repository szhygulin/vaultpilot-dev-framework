import { test, expect } from "vitest";
import { existsSync } from "node:fs";
test("package.json present", () => {
  expect(existsSync("package.json")).toBe(true);
});
