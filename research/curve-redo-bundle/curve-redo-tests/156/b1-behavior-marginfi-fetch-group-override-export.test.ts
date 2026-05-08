import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

/**
 * fetchGroupDataOverride is the hardened replacement for the SDK's group fetcher;
 * the issue states it 'continues to skip per-bank' on decode failures. It must be exported.
 */
test("src/modules/solana/marginfi.js exports fetchGroupDataOverride as a function", () => {
  expect(typeof (marginfi as Record<string, unknown>).fetchGroupDataOverride).toBe("function");
});
