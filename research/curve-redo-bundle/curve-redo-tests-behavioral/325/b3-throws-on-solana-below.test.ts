// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 throws on solana below", async () => {
  expect(() => assertCanonicalLedgerApp({ reportedName: "Solana", reportedVersion: "1.0.0", expectedNames: ["Solana"] })).toThrow(/below the minimum/);
});
