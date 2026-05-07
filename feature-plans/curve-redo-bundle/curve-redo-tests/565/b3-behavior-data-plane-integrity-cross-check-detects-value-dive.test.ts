import { test, expect } from "vitest";
import { crossCheckResponses } from "../src/security/data-plane-integrity.js";

test("crossCheckResponses flags value divergence as inconsistent", () => {
  const a = {
    data_source: { provider: "alchemy", block_height: 17000000, signature: "0xaa" },
    totalUsd: 1000,
  };
  const b = {
    data_source: { provider: "infura", block_height: 17000000, signature: "0xbb" },
    totalUsd: 999999999,
  };
  const result = crossCheckResponses(a, b);
  expect(result.consistent).toBe(false);
});
