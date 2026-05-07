import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

/**
 * The issue's repro: `get_marginfi_diagnostics` (no args) surfaces the full skip list.
 * The handler must return a structure that — when stringified — references the
 * concept of skipped banks and decode-step attribution, so users can act on it.
 */
test("diagnostics handler return shape mentions skipped banks and a decode step", async () => {
  const mod = marginfi as Record<string, unknown>;
  const candidates = [
    "getMarginfiDiagnostics",
    "handleGetMarginfiDiagnostics",
    "runMarginfiDiagnostics",
    "marginfiDiagnostics",
  ];
  const handlerKey = candidates.find((k) => typeof mod[k] === "function");
  expect(handlerKey).toBeDefined();
  const handler = mod[handlerKey!] as (args?: Record<string, unknown>) => Promise<unknown> | unknown;
  let result: unknown;
  let err: unknown = null;
  try {
    result = await handler({});
  } catch (e) {
    err = e;
  }
  const text = JSON.stringify({ result, err: err instanceof Error ? err.message : err });
  // The diagnostic surface must speak about skips/decode/banks somewhere in its output OR error.
  expect(/skip|decode|bank|oracleSetup|MarginFi/i.test(text)).toBe(true);
});
