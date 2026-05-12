// btc-usb signs multiple flows; helper used >= 3 times.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 btc signer all paths use helper", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/btc-usb-signer.ts"), "utf8");
  expect(src).toMatch(/assertCanonicalLedgerApp[\s\S]*?assertCanonicalLedgerApp[\s\S]*?assertCanonicalLedgerApp/);
});
