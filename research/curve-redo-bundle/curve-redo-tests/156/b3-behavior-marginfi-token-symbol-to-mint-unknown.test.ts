import { test, expect } from "vitest";

test("tokenSymbolToMint returns null/undefined or throws for an unknown symbol", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js");
  const fn = mod.tokenSymbolToMint || mod.tokenSymbolToMintMap?.get?.bind(mod.tokenSymbolToMintMap);
  expect(typeof fn === "function" || mod.tokenSymbolToMint !== undefined).toBe(true);
  if (typeof fn === "function") {
    let result: unknown = "sentinel";
    try {
      result = fn("NOT_A_REAL_TOKEN_XYZZY");
    } catch {
      result = null;
    }
    expect(result === null || result === undefined).toBe(true);
  }
});
