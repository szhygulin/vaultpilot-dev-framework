import { test, expect } from "vitest";

test("tryReadMintFromRawBankData with a single-byte input does not throw", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const fn = mod.tryReadMintFromRawBankData;
  if (typeof fn !== "function") {
    expect.fail("tryReadMintFromRawBankData export missing");
  }
  let threw: unknown = null;
  try {
    fn(Buffer.from([0x00]));
  } catch (e) {
    threw = e;
  }
  expect(threw).toBeNull();
});
