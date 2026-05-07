import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects data_source set to null", () => {
  const result = validateDataSource({ data_source: null });
  expect(result.valid).toBe(false);
});
