// BTC multisig second helper invocation (sign).
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 btc multisig second call uses helper", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/btc/multisig.ts"), "utf8");
  expect(src).toMatch(/signBitcoinMultisigPsbt[\s\S]*?assertCanonicalLedgerApp/);
});
