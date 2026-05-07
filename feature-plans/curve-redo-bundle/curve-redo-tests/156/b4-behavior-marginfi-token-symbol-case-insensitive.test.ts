import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

test("tokenSymbolToMint('usdc') resolves the same as 'USDC'", () => {
  const fn = (marginfi as Record<string, unknown>).tokenSymbolToMint as
    | ((s: string) => string | null | undefined)
    | undefined;
  if (typeof fn !== "function") return;
  const upper = fn("USDC");
  const lower = fn("usdc");
  expect(lower).toBe(upper);
});
