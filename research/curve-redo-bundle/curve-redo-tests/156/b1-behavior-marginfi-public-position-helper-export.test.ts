import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

/**
 * The issue cites marginfi.ts:769-777 — findBankForMint produces the actionable
 * "skipped at decode — MarginFi shipped an on-chain schema update" message.
 * It must be exported.
 */
test("src/modules/solana/marginfi.js exports findBankForMint as a function", () => {
  expect(typeof (marginfi as Record<string, unknown>).findBankForMint).toBe("function");
});
