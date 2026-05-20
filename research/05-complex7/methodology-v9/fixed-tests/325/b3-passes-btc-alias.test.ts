// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 passes btc alias", async () => {
  const restore = _setCanonicalAppWarnHook(() => {});
  try { assertCanonicalLedgerApp({ reportedName: "BTC", reportedVersion: "2.4.6", expectedNames: ["Bitcoin"] }); } finally { _setCanonicalAppWarnHook(restore); }
});
