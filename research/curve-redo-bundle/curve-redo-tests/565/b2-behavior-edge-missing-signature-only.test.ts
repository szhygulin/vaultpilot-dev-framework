import { test, expect } from "vitest";
import { validateDataSource } from "../src/security/data-source-integrity.js";

test("rejects data_source missing only signature field", () => {
  let ok: boolean;
  try {
    const r = (validateDataSource as (x: unknown) => { ok: boolean })({
      data_source: { provider: "alchemy", block_height: 100 },
    });
    ok = r.ok;
  } catch {
    ok = false;
  }
  expect(ok).toBe(false);
});
