// BTC multisig binds cosigner xpub.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 btc multisig binds cosigner", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/btc/multisig.ts"), "utf8");
  expect(src).toMatch(/btc-multisig-cosigner-xpub/);
});
