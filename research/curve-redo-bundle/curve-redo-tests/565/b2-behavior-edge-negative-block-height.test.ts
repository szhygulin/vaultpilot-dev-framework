import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-source-integrity.js";

test("rejects data_source with negative block_height", () => {
  let ok: boolean;
  try {
    const r = (validateDataSource as (x: unknown) => { ok: boolean })({
      data_source: { provider: "alchemy", block_height: -1, signature: "0xsig" },
    });
    ok = r.ok;
  } catch {
    ok = false;
  }
  expect(ok).toBe(false);
});
