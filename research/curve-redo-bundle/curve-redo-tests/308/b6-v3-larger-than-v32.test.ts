// ABI presence import.
import { test, expect } from "vitest";
import { aaveUiPoolDataProviderAbiV3, aaveUiPoolDataProviderAbiV3_2, aaveUiPoolDataProviderAbiV3_3, aaveUiPoolDataProviderAbi } from "../src/abis/aave-ui-pool-data-provider.js";

test("b6 v3 larger than v32", async () => {
  const v3 = JSON.stringify(aaveUiPoolDataProviderAbiV3);
  const v32 = JSON.stringify(aaveUiPoolDataProviderAbiV3_2);
  expect(v3.length).toBeGreaterThan(v32.length);
});
