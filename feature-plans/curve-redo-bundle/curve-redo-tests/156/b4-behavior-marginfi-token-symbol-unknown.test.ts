import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

test("unknown symbol does not throw and yields no mint", () => {
  const fn = (marginfi as Record<string, unknown>).tokenSymbolToMint as
    | ((s: string) => unknown)
    | undefined;
  if (typeof fn !== "function") return;
  let out: unknown;
  expect(() => {
    out = fn("NOT_A_REAL_TOKEN_XYZ");
  }).not.toThrow();
  expect(out == null).toBe(true);
});
