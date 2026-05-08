import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects negative block_height", () => {
  const result = validateDataSource({
    data_source: { provider: "alchemy", block_height: -1, signature: "0xabcd" },
  });
  expect(result.valid).toBe(false);
});
