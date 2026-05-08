import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects empty provider string", () => {
  const result = validateDataSource({
    data_source: { provider: "", block_height: 17000000, signature: "0xabcd" },
  });
  expect(result.valid).toBe(false);
});
