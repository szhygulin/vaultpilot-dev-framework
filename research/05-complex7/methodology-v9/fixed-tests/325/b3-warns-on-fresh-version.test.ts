// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 warns on fresh version", async () => {
  let warned = "";
  const restore = _setCanonicalAppWarnHook((m) => { warned = m; });
  try {
    assertCanonicalLedgerApp({ reportedName: "Bitcoin", reportedVersion: "2.99.0", expectedNames: ["Bitcoin"] });
    expect(warned).toMatch(/not on the known-good list/);
  } finally { _setCanonicalAppWarnHook(restore); }
});
