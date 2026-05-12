// tron-usb has helper call.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 tron signer helper present", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/tron-usb-signer.ts"), "utf8");
  expect(src).toMatch(/assertCanonicalLedgerApp/);
});
