import { test, expect } from "vitest";

test("tryReadMintFromRawBankData rejects a plain string input without crashing", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js");
  const fn = mod.tryReadMintFromRawBankData;
  expect(typeof fn).toBe("function");
  let result: unknown = "sentinel";
  let threw = false;
  try {
    result = fn("this is not a buffer" as any);
  } catch {
    threw = true;
  }
  // The contract for malformed-input is: return null, do not crash diagnostics.
  expect(threw).toBe(false);
  expect(result).toBeNull();
});
