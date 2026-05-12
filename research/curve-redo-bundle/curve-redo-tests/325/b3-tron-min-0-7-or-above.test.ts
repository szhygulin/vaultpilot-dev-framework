// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 tron min 0 7 or above", async () => {
  const min = CANONICAL_LEDGER_APPS["Tron"]!.minVersion;
  const [a, b] = min.split(".").map(Number);
  expect(a > 0 || (a === 0 && b >= 7)).toBe(true);
});
