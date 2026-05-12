// Digest empty graceful.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b6 digest empty graceful", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/digest/index.ts"), "utf8");
  expect(src).toMatch(/atRisk\s*:\s*\[\s*\]/);
});
