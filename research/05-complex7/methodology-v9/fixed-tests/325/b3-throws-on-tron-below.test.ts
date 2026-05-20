// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 throws on tron below", async () => {
  expect(() => assertCanonicalLedgerApp({ reportedName: "Tron", reportedVersion: "0.0.1", expectedNames: ["Tron"] })).toThrow(/below the minimum/);
});
