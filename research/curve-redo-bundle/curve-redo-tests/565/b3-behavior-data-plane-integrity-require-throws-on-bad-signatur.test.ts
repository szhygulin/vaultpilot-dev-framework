import { test, expect } from "vitest";
import { requireDataSource } from "../src/security/data-plane-integrity.js";

test("requireDataSource throws when signature is not a string", () => {
  expect(() =>
    requireDataSource({
      data_source: { provider: "alchemy", block_height: 100, signature: null },
    }),
  ).toThrow();
});
