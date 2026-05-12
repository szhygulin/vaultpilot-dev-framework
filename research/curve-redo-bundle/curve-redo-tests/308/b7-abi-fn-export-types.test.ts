// Exports normalized types as interface.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 abi fn export types", () => {
  const src = readFileSync(resolve(process.cwd(), "src/abis/aave-ui-pool-data-provider.ts"), "utf8");
  expect(src).toMatch(/export\s+interface\s+AaveReserveNormalized[\s\S]*?export\s+interface\s+AaveBaseCurrencyNormalized/);
});
