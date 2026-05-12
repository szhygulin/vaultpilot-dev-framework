// ltc-usb uses helper in multiple flows.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 ltc signer multiple helper", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/ltc-usb-signer.ts"), "utf8");
  expect(src).toMatch(/assertCanonicalLedgerApp[\s\S]*?assertCanonicalLedgerApp/);
});
