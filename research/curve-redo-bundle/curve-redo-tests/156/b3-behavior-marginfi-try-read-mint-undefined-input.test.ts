import { test, expect } from "vitest";

test("tryReadMintFromRawBankData rejects undefined/null inputs without throwing", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js");
  const fn = mod.tryReadMintFromRawBankData;
  expect(typeof fn).toBe("function");
  for (const bad of [undefined, null]) {
    let threw = false;
    let result: unknown = "sentinel";
    try {
      result = fn(bad as any);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result).toBeNull();
  }
});
