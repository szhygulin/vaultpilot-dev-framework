import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects array-shaped data_source", () => {
  const result = validateDataSource({ data_source: ["foo", 1, "sig"] });
  expect(result.valid).toBe(false);
});
