import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

test("README declares the project is not financial advice", () => {
  const readme = fs.readFileSync(path.resolve(__dirname, "../README.md"), "utf8").toLowerCase();
  expect(readme).toMatch(/not\s+(?:a\s+source\s+of\s+)?(?:financial|investment)\s+advice|no\s+financial\s+advice/);
});
