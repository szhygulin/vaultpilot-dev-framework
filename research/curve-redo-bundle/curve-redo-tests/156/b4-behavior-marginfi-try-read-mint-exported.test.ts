import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

test("tryReadMintFromRawBankData is exported as a function", () => {
  const fn = (marginfi as Record<string, unknown>).tryReadMintFromRawBankData;
  expect(typeof fn).toBe("function");
});

test("tryReadMintFromRawBankData accepts a Buffer and does not throw", () => {
  const fn = (marginfi as Record<string, unknown>).tryReadMintFromRawBankData as
    | ((b: Buffer) => unknown)
    | undefined;
  if (typeof fn !== "function") return;
  expect(() => fn(Buffer.alloc(0))).not.toThrow();
  expect(() => fn(Buffer.alloc(2304))).not.toThrow();
});
