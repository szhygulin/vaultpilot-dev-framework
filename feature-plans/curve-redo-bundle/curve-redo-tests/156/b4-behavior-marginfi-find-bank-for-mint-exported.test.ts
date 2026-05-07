import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

test("findBankForMint is exported as a function", () => {
  expect(typeof (marginfi as Record<string, unknown>).findBankForMint).toBe("function");
});
