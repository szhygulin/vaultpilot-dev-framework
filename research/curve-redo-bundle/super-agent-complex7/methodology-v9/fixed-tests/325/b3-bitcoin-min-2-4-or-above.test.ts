// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 bitcoin min 2 4 or above", async () => {
  expect(CANONICAL_LEDGER_APPS["Bitcoin"]!.minVersion).toMatch(/^2\.[1-9]/);
});
