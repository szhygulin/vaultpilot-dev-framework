// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 throws on wrong app", async () => {
  expect(() => assertCanonicalLedgerApp({ reportedName: "Solana", reportedVersion: "1.12.1", expectedNames: ["Bitcoin"] })).toThrow(/expected one of|expected/);
});
