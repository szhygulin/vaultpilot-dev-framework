// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 litecoin known good non empty", async () => {
  expect(CANONICAL_LEDGER_APPS["Litecoin"]!.knownGood.length).toBeGreaterThan(0);
});
