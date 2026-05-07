import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

/**
 * The issue references tryReadMintFromRawBankData by name as the way each
 * skipped bank is attributed to its mint. It must be exported from the module.
 */
test("src/modules/solana/marginfi.js exports tryReadMintFromRawBankData as a function", () => {
  expect(typeof (marginfi as Record<string, unknown>).tryReadMintFromRawBankData).toBe("function");
});
