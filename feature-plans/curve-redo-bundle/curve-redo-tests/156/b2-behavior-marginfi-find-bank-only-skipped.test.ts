import { test, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";

test("findBankForMint returns 'skipped at decode' explanation when the sole bank for the mint was skipped", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const fn = mod.findBankForMint;
  if (typeof fn !== "function") {
    expect.fail("findBankForMint export missing");
  }
  const usdc = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const skippedAddr = new PublicKey("Be5LNsiFzSCdfd84vyhRCQjPzpukSULASMdZQfFdpump".slice(0, 43) + "1".repeat(0)).toString?.() ?? "Be5LNs";
  const skipped = [
    {
      address: "Be5LNs1111111111111111111111111111111111111",
      mint: usdc.toBase58(),
      reason: "decode",
      oracleSetup: 15,
    },
  ];
  const got = await Promise.resolve(
    fn({ banks: new Map(), skippedBanks: skipped }, usdc),
  ).catch((e: unknown) => e);
  const text =
    got instanceof Error
      ? got.message
      : typeof got === "string"
        ? got
        : JSON.stringify(got ?? "");
  expect(text.toLowerCase()).toContain("skipped");
  expect(text.toLowerCase()).toContain("decode");
});
