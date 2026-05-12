// Schemas has compound-v3.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 schemas compound", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/digest/schemas.ts"), "utf8");
  expect(src).toMatch(/["']compound-v3["']/);
});
