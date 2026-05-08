import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects data_source without provider", () => {
  const result = validateDataSource({
    data_source: { block_height: 123, signature: "0xabcd" },
  });
  expect(result.valid).toBe(false);
});
