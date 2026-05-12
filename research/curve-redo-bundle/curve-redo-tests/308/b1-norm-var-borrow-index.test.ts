// Normalized.variableBorrowIndex.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 norm var borrow index", () => {
  const src = readFileSync(resolve(process.cwd(), "src/abis/aave-ui-pool-data-provider.ts"), "utf8");
  expect(src).toMatch(/AaveReserveNormalized[\s\S]*?variableBorrowIndex/);
});
