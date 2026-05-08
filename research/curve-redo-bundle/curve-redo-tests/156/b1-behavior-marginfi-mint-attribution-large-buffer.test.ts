import { test, expect } from "vitest";
import { tryReadMintFromRawBankData } from "../src/modules/solana/marginfi.js";

/**
 * If MarginFi extends the Bank struct (the canonical fix the issue calls for),
 * the raw account will grow. Mint reading must remain tied to the prefix and
 * stay valid for buffers larger than today's Bank size.
 */
test("tryReadMintFromRawBankData succeeds on a 64KB buffer with mint at offset 8", () => {
  const buf = Buffer.alloc(65536);
  for (let i = 0; i < 32; i++) buf[8 + i] = 0xa9;
  // include both unknown variants in different sentinel positions; reader must ignore them.
  buf[8 + 32 + 32 + 256] = 15;
  buf[8 + 32 + 32 + 512] = 16;
  const mint = tryReadMintFromRawBankData(buf);
  expect(mint).toBeTruthy();
});
