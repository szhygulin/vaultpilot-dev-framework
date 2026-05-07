import { test, expect } from "vitest";
import * as marginfi from "../src/modules/solana/marginfi.js";

test("src/modules/solana/marginfi.js exposes a prepare_marginfi_borrow handler", () => {
  const mod = marginfi as Record<string, unknown>;
  const candidates = [
    "prepareMarginfiBorrow",
    "handlePrepareMarginfiBorrow",
    "prepare_marginfi_borrow",
  ];
  const found = candidates.find((k) => typeof mod[k] === "function");
  expect(found).toBeDefined();
});
