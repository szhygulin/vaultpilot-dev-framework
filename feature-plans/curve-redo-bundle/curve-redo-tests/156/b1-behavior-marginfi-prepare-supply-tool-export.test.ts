import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

/**
 * The issue lists prepare_marginfi_supply as the user-facing tool that must error
 * actionably when a bank has been skipped at decode. The handler must exist.
 */
test("src/modules/solana/marginfi.js exposes a prepare_marginfi_supply handler", () => {
  const mod = marginfi as Record<string, unknown>;
  const candidates = [
    "prepareMarginfiSupply",
    "handlePrepareMarginfiSupply",
    "prepare_marginfi_supply",
  ];
  const found = candidates.find((k) => typeof mod[k] === "function");
  expect(found).toBeDefined();
});
