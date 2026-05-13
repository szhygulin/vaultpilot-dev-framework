// Reset-cache test hook.
import { test, expect } from "vitest";
import { _resetAaveAbiCacheForTest } from "../src/abis/aave-ui-pool-data-provider.js";

test("b6 reset cache no arg", async () => {
  expect(() => _resetAaveAbiCacheForTest()).not.toThrow();
});
