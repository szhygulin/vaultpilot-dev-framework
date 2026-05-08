import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-source-integrity.js";

test("accepts data_source with single-character provider name", () => {
  const r = (validateDataSource as (x: unknown) => { ok: boolean })({
    data_source: { provider: "A", block_height: 1, signature: "0xsig" },
  });
  expect(r.ok).toBe(true);
});
