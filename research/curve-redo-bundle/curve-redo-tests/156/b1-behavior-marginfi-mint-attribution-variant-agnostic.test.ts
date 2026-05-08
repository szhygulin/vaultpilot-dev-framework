import { test, expect } from "vitest";
import { tryReadMintFromRawBankData } from "../src/modules/solana/marginfi.js";

/**
 * The mint attribution must be variant-agnostic: a buffer carrying oracleSetup=15
 * and an otherwise-identical buffer carrying oracleSetup=16 must yield the SAME mint.
 */
test("mint attribution is identical for variant 15 and variant 16 buffers with the same mint bytes", () => {
  const make = (variant: number) => {
    const b = Buffer.alloc(2048);
    for (let i = 0; i < 8; i++) b[i] = 0x42;
    for (let i = 0; i < 32; i++) b[8 + i] = 0xee;
    b[8 + 32 + 32 + 256] = variant;
    return b;
  };
  const m15 = tryReadMintFromRawBankData(make(15));
  const m16 = tryReadMintFromRawBankData(make(16));
  expect(m15).toBeTruthy();
  expect(m16).toBeTruthy();
  expect(String(m15)).toBe(String(m16));
});
