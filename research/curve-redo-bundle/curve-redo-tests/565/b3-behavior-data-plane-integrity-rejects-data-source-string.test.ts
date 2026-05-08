import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-plane-integrity.js";

test("validateDataSource rejects scalar string data_source", () => {
  const result = validateDataSource({ data_source: "alchemy" });
  expect(result.valid).toBe(false);
});
