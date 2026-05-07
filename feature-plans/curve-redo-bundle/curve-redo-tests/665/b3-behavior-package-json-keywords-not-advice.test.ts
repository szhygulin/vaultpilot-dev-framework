import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

test("package.json description or keywords flags non-advice positioning", () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
  const blob = JSON.stringify({ description: pkg.description, keywords: pkg.keywords }).toLowerCase();
  expect(blob).toMatch(/not\s+(?:a\s+source\s+of\s+)?(?:financial|investment)\s+advice|no\s+financial\s+advice|no-advice|not-advice|disclaimer/);
});
