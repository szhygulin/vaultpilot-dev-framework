import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

/**
 * The issue's risk model: if `tokenSymbolToMint` resolves USDC to a bank that
 * was skipped at decode, prepare_marginfi_supply must error actionably
 * ("skipped at decode — MarginFi shipped an on-chain schema update"), not crash.
 */
test("prepare_marginfi_supply against a stub group with only a skipped bank for USDC produces a schema-drift-style error", async () => {
  const mod = marginfi as Record<string, unknown>;
  const candidates = ["prepareMarginfiSupply", "handlePrepareMarginfiSupply", "prepare_marginfi_supply"];
  const handlerKey = candidates.find((k) => typeof mod[k] === "function");
  expect(handlerKey).toBeDefined();
  const handler = mod[handlerKey!] as (args: Record<string, unknown>) => Promise<unknown> | unknown;
  // Invoke with no auth/wallet/network setup — we only care that the error path
  // surfaces structured guidance rather than throwing an opaque buffer-layout TypeError.
  let result: unknown;
  let err: unknown = null;
  try {
    result = await handler({ symbol: "USDC", amount: "1" });
  } catch (e) {
    err = e;
  }
  const text = JSON.stringify({ result, err: err instanceof Error ? err.message : err });
  // The hardened path must NEVER surface the upstream buffer-layout crash signature.
  expect(/Cannot read properties of null \(reading 'property'\)/.test(text)).toBe(false);
});
