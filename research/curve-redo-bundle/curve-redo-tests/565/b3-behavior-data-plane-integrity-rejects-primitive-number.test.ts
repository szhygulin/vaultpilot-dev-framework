import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects primitive number", () => {
  const result = validateDataSource(123 as unknown);
  expect(result.valid).toBe(false);
});
