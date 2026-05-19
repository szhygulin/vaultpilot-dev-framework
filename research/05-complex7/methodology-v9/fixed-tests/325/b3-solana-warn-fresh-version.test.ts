// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 solana warn fresh version", async () => {
  let warned = false;
  const restore = _setCanonicalAppWarnHook(() => { warned = true; });
  try {
    assertCanonicalLedgerApp({ reportedName: "Solana", reportedVersion: "1.99.0", expectedNames: ["Solana"] });
    expect(warned).toBe(true);
  } finally { _setCanonicalAppWarnHook(restore); }
});
