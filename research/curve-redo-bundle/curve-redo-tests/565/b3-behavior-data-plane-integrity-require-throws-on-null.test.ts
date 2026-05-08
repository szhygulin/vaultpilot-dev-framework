import { test, expect } from "vitest";
import { requireDataSource } from "../src/security/data-plane-integrity.js";

test("requireDataSource throws on null payload", () => {
  expect(() => requireDataSource(null as unknown)).toThrow();
});
