import { test, expect } from "vitest";
import { existsSync } from "node:fs";
test("src/ directory exists in target repo", () => {
  expect(existsSync("src/")).toBe(true);
});
