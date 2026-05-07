import { test, expect } from "vitest";
import { tryReadMintFromRawBankData } from "../src/modules/solana/marginfi.js";

test("tryReadMintFromRawBankData(empty buffer) is null", () => {
  expect(tryReadMintFromRawBankData(Buffer.alloc(0))).toBeNull();
});
