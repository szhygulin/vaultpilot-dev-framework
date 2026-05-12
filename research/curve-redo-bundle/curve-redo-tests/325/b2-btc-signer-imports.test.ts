// btc-usb imports assert.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 btc signer imports", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/btc-usb-signer.ts"), "utf8");
  expect(src).toMatch(/assertCanonicalLedgerApp/);
});
