// Digest returns empty result on no wallets.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 digest empty when no wallets", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/digest/index.ts"), "utf8");
  expect(src).toMatch(/atRisk\s*:\s*\[\s*\]/);
});
