import { test, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";

test("findBankForMint with empty bank set surfaces a not-found error", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const fn = mod.findBankForMint;
  if (typeof fn !== "function") {
    expect.fail("findBankForMint export missing");
  }
  const usdc = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const result = await Promise.resolve(
    fn({ banks: new Map(), skippedBanks: [] }, usdc),
  ).catch((e: unknown) => ({ error: e }));
  // Either a typed error result OR null/undefined — but never the active bank.
  if (result && typeof result === "object" && "address" in result && "oracleSetup" in result) {
    expect.fail("findBankForMint returned an active bank when none existed");
  }
  expect(result).toBeDefined();
});
