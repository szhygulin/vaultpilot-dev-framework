import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-source-integrity.js";

test("rejects data_source missing only provider field", () => {
  let ok: boolean;
  try {
    const r = (validateDataSource as (x: unknown) => { ok: boolean })({
      data_source: { block_height: 100, signature: "0xsig" },
    });
    ok = r.ok;
  } catch {
    ok = false;
  }
  expect(ok).toBe(false);
});
