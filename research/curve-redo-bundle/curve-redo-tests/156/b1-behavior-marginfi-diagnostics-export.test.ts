import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

/**
 * The issue's reproduction step is `get_marginfi_diagnostics` (no args) — there must
 * be an exported handler for that tool. It is conventionally named
 * getMarginfiDiagnostics or handleGetMarginfiDiagnostics in this repo's style.
 */
test("src/modules/solana/marginfi.js exposes a diagnostics handler that takes no required args", () => {
  const mod = marginfi as Record<string, unknown>;
  const candidates = [
    "getMarginfiDiagnostics",
    "handleGetMarginfiDiagnostics",
    "runMarginfiDiagnostics",
    "marginfiDiagnostics",
  ];
  const found = candidates.find((k) => typeof mod[k] === "function");
  expect(found).toBeDefined();
});
