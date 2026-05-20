// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 litecoin known good", async () => {
  const restore = _setCanonicalAppWarnHook(() => {});
  try { assertCanonicalLedgerApp({ reportedName: "Litecoin", reportedVersion: CANONICAL_LEDGER_APPS["Litecoin"]!.knownGood[0], expectedNames: ["Litecoin"] }); } finally { _setCanonicalAppWarnHook(restore); }
});
