// BTC multisig imports assert.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 btc multisig imports", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/btc/multisig.ts"), "utf8");
  expect(src).toMatch(/assertCanonicalLedgerApp/);
});
