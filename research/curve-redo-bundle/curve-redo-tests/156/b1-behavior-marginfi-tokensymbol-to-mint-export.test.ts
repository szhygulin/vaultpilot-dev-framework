import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

/**
 * The issue describes the resolution chain `tokenSymbolToMint -> findBankForMint`.
 * tokenSymbolToMint must be exposed (function or object) so the chain works.
 */
test("src/modules/solana/marginfi.js exposes tokenSymbolToMint", () => {
  const mod = marginfi as Record<string, unknown>;
  const v = mod.tokenSymbolToMint;
  expect(v === undefined).toBe(false);
  expect(["function", "object"]).toContain(typeof v);
});
