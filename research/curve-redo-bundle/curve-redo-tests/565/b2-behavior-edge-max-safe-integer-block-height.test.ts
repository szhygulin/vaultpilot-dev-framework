import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-source-integrity.js";

test("accepts data_source with Number.MAX_SAFE_INTEGER block_height", () => {
  const r = (validateDataSource as (x: unknown) => { ok: boolean })({
    data_source: {
      provider: "alchemy",
      block_height: Number.MAX_SAFE_INTEGER,
      signature: "0xdeadbeef",
    },
  });
  expect(r.ok).toBe(true);
});
