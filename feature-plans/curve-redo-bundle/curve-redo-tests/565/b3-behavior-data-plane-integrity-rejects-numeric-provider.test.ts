import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects numeric provider", () => {
  const result = validateDataSource({
    data_source: { provider: 42, block_height: 17000000, signature: "0xabcd" },
  });
  expect(result.valid).toBe(false);
});
