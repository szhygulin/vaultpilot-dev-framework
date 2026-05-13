// ABI presence import.
import { test, expect } from "vitest";
import { aaveUiPoolDataProviderAbiV3, aaveUiPoolDataProviderAbiV3_2, aaveUiPoolDataProviderAbiV3_3, aaveUiPoolDataProviderAbi } from "../src/abis/aave-ui-pool-data-provider.js";

test("b6 v32 has reserves", async () => {
  const has = (aaveUiPoolDataProviderAbiV3_2 as any[]).some((e: any) => e.name === "getReservesData");
  expect(has).toBe(true);
});
