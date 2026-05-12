// Encoding uses default V3.2 ABI.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 abi encode uses v32 default", () => {
  const src = readFileSync(resolve(process.cwd(), "src/abis/aave-ui-pool-data-provider.ts"), "utf8");
  expect(src).toMatch(/encodeFunctionData[\s\S]*?aaveUiPoolDataProviderAbiV3_2/);
});
