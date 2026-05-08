import { test, expect } from "vitest";

test("tryReadMintFromRawBankData returns nullish for truncated buffer (off-by-one too small)", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const fn = mod.tryReadMintFromRawBankData;
  if (typeof fn !== "function") {
    expect.fail("tryReadMintFromRawBankData export missing");
  }
  // Anchor account discriminator is 8 bytes; a mint pubkey is 32 bytes.
  // Anything < 40 bytes cannot contain both — must not throw, must return nullish.
  const tiny = Buffer.alloc(39, 0xff);
  const out = fn(tiny);
  expect(out == null).toBe(true);
});
