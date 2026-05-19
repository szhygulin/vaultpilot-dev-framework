// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 solana min 1 10 or above", async () => {
  const min = CANONICAL_LEDGER_APPS["Solana"]!.minVersion;
  const [a, b] = min.split(".").map(Number);
  expect(a > 1 || (a === 1 && b >= 10)).toBe(true);
});
