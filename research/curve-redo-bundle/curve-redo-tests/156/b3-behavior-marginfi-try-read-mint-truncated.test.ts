import { test, expect } from "vitest";

test("tryReadMintFromRawBankData returns null for buffer truncated before the mint offset", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js");
  const fn = mod.tryReadMintFromRawBankData;
  expect(typeof fn).toBe("function");
  // 16 bytes is far less than the discriminator (8) + Pubkey (32) needed to reach a mint.
  let result: unknown = "sentinel";
  let threw = false;
  try {
    result = fn(Buffer.alloc(16, 0xff));
  } catch {
    threw = true;
  }
  expect(threw).toBe(false);
  expect(result).toBeNull();
});
