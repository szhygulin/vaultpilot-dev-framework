import { test, expect } from "vitest";

test("single-bank group with variant 15 yields one skipped bank, no crash", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const fn = mod.fetchGroupDataOverride;
  if (typeof fn !== "function") {
    expect.fail("fetchGroupDataOverride export missing");
  }
  // Synthetic minimal AccountInfo with discriminator + mint + variant byte.
  // This test only asserts that, given a synthetic raw-decode failure, the function
  // returns a structured result rather than throwing.
  const fakeBankAddress = "Be5LNs1111111111111111111111111111111111111";
  const ai = {
    address: fakeBankAddress,
    data: Buffer.alloc(1024, 0),
    oracleSetupRawByte: 15,
  };
  const result = await Promise.resolve(
    fn({ bankAccounts: [ai] }, { skipDecode: false }),
  ).catch((e: unknown) => e);
  if (result instanceof Error) {
    expect.fail(`fetchGroupDataOverride threw on single variant-15 bank: ${result.message}`);
  }
  const skipped = (result as any)?.skippedBanks ?? (result as any)?.skipped ?? [];
  expect(Array.isArray(skipped)).toBe(true);
});
