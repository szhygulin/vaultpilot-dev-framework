import { test, expect } from "vitest";
import { requireDataSource } from "../src/security/data-plane-integrity.js";

test("requireDataSource throws on payload missing data_source", () => {
  expect(() => requireDataSource({ totalUsd: 100 })).toThrow();
});
