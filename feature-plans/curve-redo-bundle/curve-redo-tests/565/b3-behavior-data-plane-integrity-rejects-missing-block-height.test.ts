import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects data_source without block_height", () => {
  const result = validateDataSource({
    data_source: { provider: "alchemy", signature: "0xabcd" },
  });
  expect(result.valid).toBe(false);
});
