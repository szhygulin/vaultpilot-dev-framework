import { test, expect } from "vitest";
import { tryReadMintFromRawBankData } from "../src/modules/solana/marginfi.js";

/**
 * Variant 16 is the previously-known unknown oracleSetup. The mint reader must
 * succeed for buffers carrying this variant byte too.
 */
test("tryReadMintFromRawBankData returns a non-null mint for a buffer carrying oracleSetup=16", () => {
  const buf = Buffer.alloc(2048);
  for (let i = 0; i < 8; i++) buf[i] = 0x10 + i;
  for (let i = 0; i < 32; i++) buf[8 + i] = 0xcd;
  buf[8 + 32 + 32 + 256] = 16;
  const mint = tryReadMintFromRawBankData(buf);
  expect(mint).toBeTruthy();
  expect(mint).not.toBeNull();
});
