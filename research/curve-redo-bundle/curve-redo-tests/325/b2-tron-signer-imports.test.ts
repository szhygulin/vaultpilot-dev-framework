// tron-usb imports assert.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 tron signer imports", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/tron-usb-signer.ts"), "utf8");
  expect(src).toMatch(/assertCanonicalLedgerApp/);
});
