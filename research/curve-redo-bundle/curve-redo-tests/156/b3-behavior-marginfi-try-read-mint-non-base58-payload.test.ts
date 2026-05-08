import { test, expect } from "vitest";

test("tryReadMintFromRawBankData handles all-zero pubkey region without throwing", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js");
  const fn = mod.tryReadMintFromRawBankData;
  expect(typeof fn).toBe("function");
  // 4096 zeroed bytes — well past any plausible mint offset. Any decoded pubkey must be base58 or null.
  let result: unknown = "sentinel";
  let threw = false;
  try {
    result = fn(Buffer.alloc(4096, 0));
  } catch {
    threw = true;
  }
  expect(threw).toBe(false);
  // Either null (rejected) or a string that is base58-shaped — never an object/throw.
  if (result !== null) {
    expect(typeof result).toBe("string");
    expect((result as string).length).toBeGreaterThan(0);
    expect(/^[1-9A-HJ-NP-Za-km-z]+$/.test(result as string)).toBe(true);
  }
});
