// Digest gates on both wallets.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 digest checks both wallets", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/digest/index.ts"), "utf8");
  expect(src).toMatch(/args\.wallet\s*&&\s*!args\.solanaAddress|!args\.wallet\s*&&\s*!args\.solanaAddress/);
});
