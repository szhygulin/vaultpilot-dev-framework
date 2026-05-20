// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 tron known good", async () => {
  const restore = _setCanonicalAppWarnHook(() => {});
  try { assertCanonicalLedgerApp({ reportedName: "Tron", reportedVersion: CANONICAL_LEDGER_APPS["Tron"]!.knownGood[0], expectedNames: ["Tron"] }); } finally { _setCanonicalAppWarnHook(restore); }
});
