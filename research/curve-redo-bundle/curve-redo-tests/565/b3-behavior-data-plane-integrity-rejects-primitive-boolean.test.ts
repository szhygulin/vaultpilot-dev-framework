import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects primitive boolean", () => {
  const result = validateDataSource(true as unknown);
  expect(result.valid).toBe(false);
});
