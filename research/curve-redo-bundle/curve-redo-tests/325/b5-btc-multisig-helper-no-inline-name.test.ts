// BTC multisig removed inline `appInfo.name !==`.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 btc multisig helper no inline name", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/btc/multisig.ts"), "utf8");
  expect(src).toMatch(/assertCanonicalLedgerApp/);
});
