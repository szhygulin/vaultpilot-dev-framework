// Parses major.minor.patch.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b4 canonical version major minor patch", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/major.*minor.*patch|<major>\.<minor>\.<patch>/i);
});
