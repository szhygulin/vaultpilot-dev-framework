import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

test("buffers shorter than mint offset+32 yield no mint string", () => {
  const fn = (marginfi as Record<string, unknown>).tryReadMintFromRawBankData as
    | ((b: Buffer) => unknown)
    | undefined;
  if (typeof fn !== "function") {
    expect.fail("tryReadMintFromRawBankData missing");
    return;
  }
  const out = fn(Buffer.alloc(8)); // smaller than discriminator+mint
  expect(out == null || out === "").toBe(true);
});
