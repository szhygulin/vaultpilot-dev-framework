import { test, expect } from "vitest";

test("tryReadMintFromRawBankData returns nullish on empty buffer", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const fn = mod.tryReadMintFromRawBankData;
  if (typeof fn !== "function") {
    expect.fail("tryReadMintFromRawBankData export missing");
  }
  const out = fn(Buffer.alloc(0));
  expect(out == null).toBe(true);
});
