// The swap leg's `to` field should reference the validated pool identifier.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("swap-tx object literal uses to: pool (validated pool identifier)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).toMatch(/to\s*:\s*pool/);
});
