import { test, expect } from "vitest";

test("tryReadMintFromRawBankData returns null for an empty buffer instead of throwing", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js");
  const fn = mod.tryReadMintFromRawBankData;
  expect(typeof fn).toBe("function");
  // Empty buffer is malformed input — must be rejected as null, not propagate a slice/decode error.
  let result: unknown = "sentinel";
  let threw = false;
  try {
    result = fn(Buffer.alloc(0));
  } catch {
    threw = true;
  }
  expect(threw).toBe(false);
  expect(result).toBeNull();
});
