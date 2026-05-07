import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const WSOL = "So11111111111111111111111111111111111111112";

test("tokenSymbolToMint returns canonical mint strings", () => {
  const fn = (marginfi as Record<string, unknown>).tokenSymbolToMint as
    | ((s: string) => string | null | undefined)
    | undefined;
  if (typeof fn !== "function") {
    expect.fail("tokenSymbolToMint must be exported");
    return;
  }
  expect(fn("USDC")).toBe(USDC);
  expect(fn("USDT")).toBe(USDT);
  expect([WSOL]).toContain(fn("SOL"));
});
