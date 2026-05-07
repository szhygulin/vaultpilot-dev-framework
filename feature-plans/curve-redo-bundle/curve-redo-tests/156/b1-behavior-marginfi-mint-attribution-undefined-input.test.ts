import { test, expect } from "vitest";
import { tryReadMintFromRawBankData } from "../src/modules/solana/marginfi.js";

/**
 * Defensive: the read-only smoke path must not crash even if the RPC layer
 * passes a non-Buffer (null, undefined, plain object). Returning null is fine.
 */
test("tryReadMintFromRawBankData on non-Buffer inputs returns null and does not throw", () => {
  const fn = tryReadMintFromRawBankData as (data: unknown) => unknown;
  expect(() => fn(null)).not.toThrow();
  expect(() => fn(undefined)).not.toThrow();
  expect(fn(null)).toBeNull();
  expect(fn(undefined)).toBeNull();
});
