import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects payload missing data_source key", () => {
  const payload = { totalUsd: 12345, positions: [] };
  const result = validateDataSource(payload);
  expect(result.valid).toBe(false);
});
