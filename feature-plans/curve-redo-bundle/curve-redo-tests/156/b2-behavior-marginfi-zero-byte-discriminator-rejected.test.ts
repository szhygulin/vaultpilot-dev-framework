import { test, expect } from "vitest";

test("tryReadMintFromRawBankData returns nullish for an all-zero buffer (no valid discriminator)", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const fn = mod.tryReadMintFromRawBankData;
  if (typeof fn !== "function") {
    expect.fail("tryReadMintFromRawBankData export missing");
  }
  // 1 KiB of zeros: discriminator is invalid, mint slot would be all-zero PublicKey.
  // Most defensive readers either return null OR return a sentinel — but must not throw.
  let threw: unknown = null;
  let out: unknown;
  try {
    out = fn(Buffer.alloc(1024, 0));
  } catch (e) {
    threw = e;
  }
  expect(threw).toBeNull();
  // If it returned a value, it should NOT be a non-empty base58 string (meaning a valid mint).
  if (typeof out === "string") {
    expect(out).not.toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,}$/);
  }
});
