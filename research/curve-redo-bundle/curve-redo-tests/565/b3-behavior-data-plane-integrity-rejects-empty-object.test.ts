import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects empty object missing data_source", () => {
  const result = validateDataSource({});
  expect(result.valid).toBe(false);
});
