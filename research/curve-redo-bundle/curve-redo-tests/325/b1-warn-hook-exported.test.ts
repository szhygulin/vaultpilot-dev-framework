// _setCanonicalAppWarnHook exported.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 warn hook exported", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/export\s+function\s+_setCanonicalAppWarnHook/);
});
