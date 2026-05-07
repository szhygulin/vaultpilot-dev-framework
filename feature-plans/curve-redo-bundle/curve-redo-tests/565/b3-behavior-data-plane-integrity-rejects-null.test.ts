import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects null input as invalid", () => {
  const result = validateDataSource(null as unknown);
  expect(result.valid).toBe(false);
});
