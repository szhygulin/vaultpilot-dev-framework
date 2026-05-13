// assertCanonicalLedgerApp behavior.
import { test, expect } from "vitest";
import { assertCanonicalLedgerApp, _setCanonicalAppWarnHook, CANONICAL_LEDGER_APPS } from "../src/signing/canonical-apps.js";

test("b3 set warn hook restores", async () => {
  const noop = () => {};
  const prev = _setCanonicalAppWarnHook(noop);
  const next = _setCanonicalAppWarnHook(prev);
  expect(next).toBe(noop);
});
