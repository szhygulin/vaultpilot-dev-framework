import { test, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";

test("findBankForMint returns the active bank, not the skipped one, when both exist", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const fn = mod.findBankForMint;
  if (typeof fn !== "function") {
    expect.fail("findBankForMint export missing");
  }
  const usdc = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const banks = new Map<string, any>();
  banks.set("2s37akKQ11111111111111111111111111111111111", {
    address: "2s37akKQ11111111111111111111111111111111111",
    mint: usdc.toBase58(),
    oracleSetup: 0,
  });
  const skipped = [
    {
      address: "Be5LNs1111111111111111111111111111111111111",
      mint: usdc.toBase58(),
      reason: "decode",
      oracleSetup: 15,
    },
  ];
  const got: any = await Promise.resolve(
    fn({ banks, skippedBanks: skipped }, usdc),
  );
  const addr = got?.address ?? got?.bankAddress ?? got?.publicKey?.toString?.();
  expect(String(addr ?? "")).toMatch(/^2s37akKQ/);
});
