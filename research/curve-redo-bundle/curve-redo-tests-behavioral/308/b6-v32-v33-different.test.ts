// ABI presence import.
import { test, expect } from "vitest";
import { aaveUiPoolDataProviderAbiV3, aaveUiPoolDataProviderAbiV3_2, aaveUiPoolDataProviderAbiV3_3, aaveUiPoolDataProviderAbi } from "../src/abis/aave-ui-pool-data-provider.js";

test("b6 v32 v33 different", async () => {
  expect(aaveUiPoolDataProviderAbiV3_2).not.toBe(aaveUiPoolDataProviderAbiV3_3);
});
