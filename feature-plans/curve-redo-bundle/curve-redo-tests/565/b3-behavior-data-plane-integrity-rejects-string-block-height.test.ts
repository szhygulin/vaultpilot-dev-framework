import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects string-typed block_height", () => {
  const result = validateDataSource({
    data_source: { provider: "alchemy", block_height: "17000000", signature: "0xabcd" },
  });
  expect(result.valid).toBe(false);
});
