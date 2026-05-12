// imports AaveBaseCurrencyNormalized.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 positions aave imports base", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/aave.ts"), "utf8");
  expect(src).toMatch(/AaveBaseCurrencyNormalized/);
});
