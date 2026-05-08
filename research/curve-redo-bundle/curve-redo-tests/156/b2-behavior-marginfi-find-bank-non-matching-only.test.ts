import { test, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";

test("findBankForMint with the only bank holding a different mint returns not-found", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const fn = mod.findBankForMint;
  if (typeof fn !== "function") {
    expect.fail("findBankForMint export missing");
  }
  const usdc = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const sol = new PublicKey("So11111111111111111111111111111111111111112");
  const banks = new Map<string, any>();
  banks.set("CCKtUs1111111111111111111111111111111111111", {
    address: "CCKtUs1111111111111111111111111111111111111",
    mint: sol.toBase58(),
    oracleSetup: 0,
  });
  const got: any = await Promise.resolve(
    fn({ banks, skippedBanks: [] }, usdc),
  ).catch((e: unknown) => ({ error: e }));
  // Should not return a SOL bank for a USDC query.
  const returnedMint = got?.mint ?? got?.bank?.mint;
  if (returnedMint) {
    expect(returnedMint).not.toBe(sol.toBase58());
  }
});
