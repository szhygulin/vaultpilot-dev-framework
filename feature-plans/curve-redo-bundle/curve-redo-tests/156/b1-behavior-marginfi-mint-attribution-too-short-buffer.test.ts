import { test, expect } from "vitest";
import { tryReadMintFromRawBankData } from "../src/modules/solana/marginfi.js";

/**
 * The attribution helper must NEVER throw — it should return null on buffers that
 * are too short (e.g. truncated RPC response). The hardened client relies on this
 * to keep the read-only smoke path crash-free.
 */
test("tryReadMintFromRawBankData returns null (does not throw) for a buffer shorter than 40 bytes", () => {
  expect(() => tryReadMintFromRawBankData(Buffer.alloc(0))).not.toThrow();
  expect(() => tryReadMintFromRawBankData(Buffer.alloc(8))).not.toThrow();
  expect(() => tryReadMintFromRawBankData(Buffer.alloc(39))).not.toThrow();
  expect(tryReadMintFromRawBankData(Buffer.alloc(0))).toBeNull();
  expect(tryReadMintFromRawBankData(Buffer.alloc(8))).toBeNull();
});
