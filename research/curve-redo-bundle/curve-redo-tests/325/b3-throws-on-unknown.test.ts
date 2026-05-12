// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 throws on unknown", async () => {
  expect(() => assertCanonicalLedgerApp({ reportedName: "FakeAppX", reportedVersion: "1.0.0" })).toThrow(/not a known Ledger app/);
});
