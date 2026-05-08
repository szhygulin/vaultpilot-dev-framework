import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects non-string signature", () => {
  const result = validateDataSource({
    data_source: { provider: "alchemy", block_height: 17000000, signature: 12345 },
  });
  expect(result.valid).toBe(false);
});
