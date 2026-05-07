import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-source-integrity.js";

test("accepts response with extra unknown fields when data_source is valid", () => {
  const r = (validateDataSource as (x: unknown) => { ok: boolean })({
    data_source: { provider: "alchemy", block_height: 42, signature: "0xabc" },
    portfolio: { total_usd: 1000 },
    extra_field: "ignored",
  });
  expect(r.ok).toBe(true);
});
