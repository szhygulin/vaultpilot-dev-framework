import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");

test("README.md mentions the not-advice / educational stance", () => {
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8").toLowerCase();
  const hit = [
    "not financial advice",
    "not investment advice",
    "informational",
    "educational",
    "disclaimer",
  ].some((needle) => readme.includes(needle));
  expect(hit).toBe(true);
});
