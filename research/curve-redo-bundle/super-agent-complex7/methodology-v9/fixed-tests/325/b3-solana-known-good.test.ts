// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 solana known good", async () => {
  const restore = _setCanonicalAppWarnHook(() => {});
  try { assertCanonicalLedgerApp({ reportedName: "Solana", reportedVersion: CANONICAL_LEDGER_APPS["Solana"]!.knownGood[0], expectedNames: ["Solana"] }); } finally { _setCanonicalAppWarnHook(restore); }
});
