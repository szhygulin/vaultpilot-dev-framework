import { test, expect } from "vitest";
import { tryReadMintFromRawBankData } from "../src/modules/solana/marginfi.js";

/**
 * If two banks have different mints (e.g. USDC vs USDT) but both have oracleSetup=15,
 * the attribution must distinguish them so the diagnostic output points at the right token.
 */
test("different mint bytes under the same unknown variant yield different attributed mints", () => {
  const mk = (mintByte: number) => {
    const b = Buffer.alloc(2048);
    for (let i = 0; i < 32; i++) b[8 + i] = mintByte;
    b[8 + 32 + 32 + 256] = 15;
    return b;
  };
  const a = tryReadMintFromRawBankData(mk(0x11));
  const b = tryReadMintFromRawBankData(mk(0x22));
  expect(a).toBeTruthy();
  expect(b).toBeTruthy();
  expect(String(a)).not.toBe(String(b));
});
