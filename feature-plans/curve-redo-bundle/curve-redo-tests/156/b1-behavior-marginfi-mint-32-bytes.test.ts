import { test, expect } from "vitest";
import { tryReadMintFromRawBankData } from "../src/modules/solana/marginfi.js";

/**
 * Solana mints are 32-byte pubkeys. The attribution function must return a value
 * that can carry 32 bytes — either a base58 string of length 32-44 or a Buffer-like
 * with byteLength 32 or a PublicKey-shape object with toBase58.
 */
test("tryReadMintFromRawBankData returns a Solana-mint-shaped value (variant 15 buffer)", () => {
  const buf = Buffer.alloc(2048);
  for (let i = 0; i < 32; i++) buf[8 + i] = 0x55;
  buf[8 + 32 + 32 + 256] = 15;
  const mint = tryReadMintFromRawBankData(buf);
  expect(mint).toBeTruthy();
  if (typeof mint === "string") {
    expect(mint.length).toBeGreaterThanOrEqual(32);
    expect(mint.length).toBeLessThanOrEqual(44);
  } else if (mint && typeof (mint as { toBase58?: () => string }).toBase58 === "function") {
    const s = (mint as { toBase58: () => string }).toBase58();
    expect(s.length).toBeGreaterThanOrEqual(32);
    expect(s.length).toBeLessThanOrEqual(44);
  } else if (mint && typeof (mint as { byteLength?: number }).byteLength === "number") {
    expect((mint as { byteLength: number }).byteLength).toBe(32);
  } else {
    throw new Error(`unexpected mint shape: ${typeof mint}`);
  }
});
