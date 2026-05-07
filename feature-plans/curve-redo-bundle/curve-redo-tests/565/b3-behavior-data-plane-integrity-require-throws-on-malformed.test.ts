import { test, expect } from "vitest";
import { requireDataSource } from "../src/security/data-plane-integrity.js";

test("requireDataSource throws when data_source lacks required keys", () => {
  expect(() =>
    requireDataSource({ data_source: { provider: "alchemy" } }),
  ).toThrow();
});
