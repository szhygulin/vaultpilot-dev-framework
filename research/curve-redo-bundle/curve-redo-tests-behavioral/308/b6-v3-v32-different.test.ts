// ABI presence import.
import { test, expect } from "vitest";
import { aaveUiPoolDataProviderAbiV3, aaveUiPoolDataProviderAbiV3_2, aaveUiPoolDataProviderAbiV3_3, aaveUiPoolDataProviderAbi } from "../src/abis/aave-ui-pool-data-provider.js";

test("b6 v3 v32 different", async () => {
  expect(aaveUiPoolDataProviderAbiV3).not.toBe(aaveUiPoolDataProviderAbiV3_2);
});
