// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 allows any no expected", async () => {
  const restore = _setCanonicalAppWarnHook(() => {});
  try { assertCanonicalLedgerApp({ reportedName: "Solana", reportedVersion: "1.12.1" }); } finally { _setCanonicalAppWarnHook(restore); }
});
