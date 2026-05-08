import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-source-integrity.js";

test("accepts a minimal valid data_source with all three required fields", () => {
  const r = (validateDataSource as (x: unknown) => { ok: boolean })({
    data_source: { provider: "alchemy", block_height: 1, signature: "0xa" },
  });
  expect(r.ok).toBe(true);
});
