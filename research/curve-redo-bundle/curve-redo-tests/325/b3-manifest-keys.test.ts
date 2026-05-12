// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 manifest keys", async () => {
  expect(Object.keys(CANONICAL_LEDGER_APPS).sort()).toEqual(["Bitcoin", "Litecoin", "Solana", "Tron"]);
});
