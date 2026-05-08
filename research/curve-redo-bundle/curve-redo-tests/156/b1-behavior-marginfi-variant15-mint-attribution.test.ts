import { test, expect } from "vitest";
import { tryReadMintFromRawBankData } from "../src/modules/solana/marginfi.js";

/**
 * Variant 15 was newly observed on mainnet on 2026-04-25. The hardened client must
 * still attribute the skipped bank to its mint via tryReadMintFromRawBankData,
 * which reads mint from a fixed offset in the raw bank account WITHOUT invoking
 * Anchor's decoder (which would crash on the unknown enum variant).
 */
test("tryReadMintFromRawBankData returns a non-null mint for a buffer carrying oracleSetup=15", () => {
  const buf = Buffer.alloc(2048);
  // 8-byte Anchor discriminator (any 8 bytes; reader does not check it)
  for (let i = 0; i < 8; i++) buf[i] = i + 1;
  // mint pubkey lives at offset 8 (32 bytes). Pick a deterministic, recognizable pattern.
  for (let i = 0; i < 32; i++) buf[8 + i] = 0xab;
  // Far down the layout we encode oracleSetup = 15 as a u8 in some sentinel position.
  // The function must not depend on this byte at all — but we set it to mimic mainnet.
  buf[8 + 32 + 32 + 256] = 15;
  const mint = tryReadMintFromRawBankData(buf);
  expect(mint).toBeTruthy();
  expect(mint).not.toBeNull();
});
