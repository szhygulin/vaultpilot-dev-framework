// Result carries durableBindings.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 btc result has durable bindings", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/btc/multisig.ts"), "utf8");
  expect(src).toMatch(/RegisterBitcoinMultisigWalletResult[\s\S]*?durableBindings/);
});
