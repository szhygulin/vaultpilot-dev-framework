// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 litecoin warn fresh version", async () => {
  let warned = false;
  const restore = _setCanonicalAppWarnHook(() => { warned = true; });
  try {
    assertCanonicalLedgerApp({ reportedName: "Litecoin", reportedVersion: "2.99.0", expectedNames: ["Litecoin"] });
    expect(warned).toBe(true);
  } finally { _setCanonicalAppWarnHook(restore); }
});
