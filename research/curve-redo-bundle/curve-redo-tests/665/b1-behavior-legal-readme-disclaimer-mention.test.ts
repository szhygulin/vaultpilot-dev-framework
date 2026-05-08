import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const readmePath = join(root, "README.md");
const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";

test("README mentions a disclaimer / legal notice / not-advice statement", () => {
  expect(readme).toMatch(/(disclaimer|legal\s+notice|not\s+(financial|investment|legal)\s+advice|important\s+notice)/i);
});
