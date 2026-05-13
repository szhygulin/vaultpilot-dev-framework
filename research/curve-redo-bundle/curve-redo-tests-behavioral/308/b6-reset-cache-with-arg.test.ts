// Reset-cache test hook.
import { test, expect } from "vitest";
import { _resetAaveAbiCacheForTest } from "../src/abis/aave-ui-pool-data-provider.js";

test("b6 reset cache with arg", async () => {
  expect(() => _resetAaveAbiCacheForTest("0x0000000000000000000000000000000000000000")).not.toThrow();
});
