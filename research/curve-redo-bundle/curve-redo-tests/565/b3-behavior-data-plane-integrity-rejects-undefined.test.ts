import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects undefined input as invalid", () => {
  const result = validateDataSource(undefined as unknown);
  expect(result.valid).toBe(false);
});
