// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 throws on below min", async () => {
  expect(() => assertCanonicalLedgerApp({ reportedName: "Bitcoin", reportedVersion: "1.0.0", expectedNames: ["Bitcoin"] })).toThrow(/below the minimum/);
});
