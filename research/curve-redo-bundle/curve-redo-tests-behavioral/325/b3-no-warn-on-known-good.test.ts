// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 no warn on known good", async () => {
  let warned = false;
  const restore = _setCanonicalAppWarnHook(() => { warned = true; });
  try {
    assertCanonicalLedgerApp({ reportedName: "Bitcoin", reportedVersion: CANONICAL_LEDGER_APPS["Bitcoin"]!.knownGood[0], expectedNames: ["Bitcoin"] });
    expect(warned).toBe(false);
  } finally { _setCanonicalAppWarnHook(restore); }
});
