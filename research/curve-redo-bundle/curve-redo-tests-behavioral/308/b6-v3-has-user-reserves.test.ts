// ABI presence import.
import { test, expect } from "vitest";
import { aaveUiPoolDataProviderAbiV3, aaveUiPoolDataProviderAbiV3_2, aaveUiPoolDataProviderAbiV3_3, aaveUiPoolDataProviderAbi } from "../src/abis/aave-ui-pool-data-provider.js";

test("b6 v3 has user reserves", async () => {
  const has = (aaveUiPoolDataProviderAbiV3 as any[]).some((e: any) => e.name === "getUserReservesData");
  expect(has).toBe(true);
});
