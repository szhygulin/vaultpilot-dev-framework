// Default aliases V3.2.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 abi default aliases v32", () => {
  const src = readFileSync(resolve(process.cwd(), "src/abis/aave-ui-pool-data-provider.ts"), "utf8");
  expect(src).toMatch(/aaveUiPoolDataProviderAbi\s*=\s*aaveUiPoolDataProviderAbiV3_2/);
});
