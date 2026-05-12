// Entry uses Readonly<Record<string, CanonicalAppEntry>>.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b4 canonical app entry readonly record", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/Readonly<\s*Record<\s*string\s*,\s*CanonicalAppEntry/);
});
