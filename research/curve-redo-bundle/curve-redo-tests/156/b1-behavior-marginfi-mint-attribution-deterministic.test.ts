import { test, expect } from "vitest";
import { tryReadMintFromRawBankData } from "../src/modules/solana/marginfi.js";

test("tryReadMintFromRawBankData is deterministic for the same buffer (variant 15)", () => {
  const buf = Buffer.alloc(2048);
  for (let i = 0; i < 32; i++) buf[8 + i] = 0x77;
  buf[8 + 32 + 32 + 256] = 15;
  const a = tryReadMintFromRawBankData(buf);
  const b = tryReadMintFromRawBankData(buf);
  const c = tryReadMintFromRawBankData(buf);
  expect(String(a)).toBe(String(b));
  expect(String(b)).toBe(String(c));
  expect(a).toBeTruthy();
});
