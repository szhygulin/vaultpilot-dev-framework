// solana-usb has helper call.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 solana signer helper present", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/solana-usb-signer.ts"), "utf8");
  expect(src).toMatch(/assertCanonicalLedgerApp/);
});
