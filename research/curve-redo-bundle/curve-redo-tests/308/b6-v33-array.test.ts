// ABI presence import.
import { test, expect } from "vitest";
import { aaveUiPoolDataProviderAbiV3, aaveUiPoolDataProviderAbiV3_2, aaveUiPoolDataProviderAbiV3_3, aaveUiPoolDataProviderAbi } from "../src/abis/aave-ui-pool-data-provider.js";

test("b6 v33 array", async () => {
  expect(Array.isArray(aaveUiPoolDataProviderAbiV3_3)).toBe(true);
});
