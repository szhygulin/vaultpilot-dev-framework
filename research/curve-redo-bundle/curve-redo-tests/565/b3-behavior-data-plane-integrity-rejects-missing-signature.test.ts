import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects data_source without signature", () => {
  const result = validateDataSource({
    data_source: { provider: "alchemy", block_height: 17000000 },
  });
  expect(result.valid).toBe(false);
});
