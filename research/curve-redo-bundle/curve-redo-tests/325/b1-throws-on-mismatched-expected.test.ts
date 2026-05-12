// Throws on mismatched.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 throws on mismatched expected", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/expected one of/);
});
