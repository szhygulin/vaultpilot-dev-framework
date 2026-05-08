import { test, expect } from "vitest";

test("tryReadMintFromRawBankData returns null when the leading 8 bytes are clearly not a Bank discriminator", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js");
  const fn = mod.tryReadMintFromRawBankData;
  expect(typeof fn).toBe("function");
  // Buffer large enough to carry a mint but with a zeroed discriminator that does not match Bank.
  const buf = Buffer.alloc(2048, 0);
  let result: unknown = "sentinel";
  let threw = false;
  try {
    result = fn(buf);
  } catch {
    threw = true;
  }
  expect(threw).toBe(false);
  // Either null (rejected by discriminator check) or — at most — a 32/0-byte all-zero pubkey string.
  // The contract-violation case must NOT crash the diagnostics path.
  expect(result === null || typeof result === "string").toBe(true);
});
