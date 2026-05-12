import { test, expect } from "vitest";
import { existsSync } from "node:fs";
test("src/ directory present", () => {
  expect(existsSync("src/")).toBe(true);
});
